#!/usr/bin/env python3
"""Зигзаг: статика игры + облачные сейвы для Bothost.

Один процесс: отдаёт index.html / levels.build.json и API:
  GET  /api/health             -> {"ok": true}
  GET  /api/load?player_id=..  -> {"progress": {...} | null}
  POST /api/save {player_id, progress} -> {"ok": true}

Хранилище — Supabase таблица saves (player_id text PK, progress jsonb, updated_at).
Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (обязательны для API),
     TG_BOT_TOKEN, TG_ADMIN_CHAT (опционально — алерты о 5xx),
     PORT (даёт Bothost), ALLOWED_ORIGINS (доп. источники через запятую).
Только stdlib, зависимостей нет.
"""
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "8000"))
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
TG_TOKEN = os.environ.get("TG_BOT_TOKEN", "")
TG_CHAT = os.environ.get("TG_ADMIN_CHAT", "")
EXTRA_ORIGINS = {o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()}

PLAYER_RE = re.compile(r"^[\w-]{6,64}$")
MAX_BODY = 256 * 1024
_last_tg_alert = 0.0

_rate_limits = {}
_rate_limits_lock = threading.Lock()
_last_cleanup = 0.0

def check_rate_limit(ip, limit=100, window=60):
    global _last_cleanup
    now = time.time()
    with _rate_limits_lock:
        if now - _last_cleanup > 60:
            for k in list(_rate_limits.keys()):
                valid = [t for t in _rate_limits[k] if now - t < window]
                if valid:
                    _rate_limits[k] = valid
                else:
                    del _rate_limits[k]
            _last_cleanup = now

        reqs = _rate_limits.setdefault(ip, [])
        valid_reqs = [t for t in reqs if now - t < window]
        if len(valid_reqs) >= limit:
            _rate_limits[ip] = valid_reqs
            return False
        valid_reqs.append(now)
        _rate_limits[ip] = valid_reqs
        return True

MIME = {
    ".html": "text/html; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
}
# levels.json (с эталонами _solution) намеренно не раздаём — спойлеры.
STATIC_FILES = {"index.html", "levels.build.json", "shag.html"}


def log(*args):
    print(time.strftime("[%Y-%m-%d %H:%M:%S]"), *args, flush=True)


def tg_alert(text):
    """Тихий алерт админу, не чаще раза в 5 минут на процесс."""
    global _last_tg_alert
    if not (TG_TOKEN and TG_CHAT):
        return
    if time.time() - _last_tg_alert < 300:
        return
    _last_tg_alert = time.time()
    try:
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
            data=json.dumps({"chat_id": TG_CHAT, "text": text[:3500]}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=8).read()
    except Exception as exc:  # noqa: BLE001 — алерт не должен ронять процесс
        log("tg alert failed:", exc)


def supabase_configured():
    return bool(SUPABASE_URL and SUPABASE_KEY)


def supabase_request(method, path, payload=None, timeout=10):
    req = urllib.request.Request(
        SUPABASE_URL + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode(errors="replace")


def valid_player(player_id):
    return isinstance(player_id, str) and bool(PLAYER_RE.match(player_id))


def valid_progress(progress):
    return (
        isinstance(progress, dict)
        and progress.get("version") == 1
        and isinstance(progress.get("done"), dict)
        and len(json.dumps(progress)) <= MAX_BODY
    )


class Handler(BaseHTTPRequestHandler):
    server_version = "zigzag/1.0"

    def log_message(self, fmt, *args):  # тихие access-логи в своём формате
        log(f"{self.address_string()} {self.command} {self.path} ->", fmt % args)

    # --- helpers ---
    def get_client_ip(self):
        xff = self.headers.get("X-Forwarded-For")
        if xff:
            return xff.split(",")[-1].strip()
        return self.client_address[0]

    def origin_allowed(self):
        origin = self.headers.get("Origin", "")
        if origin in EXTRA_ORIGINS:
            return origin
        if re.match(r"^https://([a-z0-9-]+\.)*pikabu\.ru$", origin):
            return origin
        return ""

    def send_json(self, code, payload, extra=None):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        origin = self.origin_allowed()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return None
        if length <= 0 or length > MAX_BODY:
            return None
        try:
            return json.loads(self.rfile.read(length).decode())
        except (ValueError, UnicodeDecodeError):
            return None

    # --- routing ---
    def do_OPTIONS(self):
        if not self.path.startswith("/api/"):
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(204)
        origin = self.origin_allowed()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/"):
            if not check_rate_limit(self.get_client_ip()):
                self.send_json(429, {"error": "too_many_requests"})
                return
            if parsed.path == "/api/health":
                self.send_json(200, {"ok": True, "time": int(time.time())})
                return
            if parsed.path == "/api/load":
                self.handle_load(parse_qs_first(parsed.query))
                return
            if parsed.path == "/api/save":
                self.send_json(405, {"error": "not_found"})
                return
            self.send_json(404, {"error": "not_found"})
            return
        self.serve_static(parsed.path)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/"):
            if not check_rate_limit(self.get_client_ip()):
                self.send_json(429, {"error": "too_many_requests"})
                return
            if parsed.path == "/api/save":
                self.handle_save()
                return
        self.send_json(404, {"error": "not_found"})

    # --- api ---
    def handle_load(self, query):
        player_id = query.get("player_id", "")
        if not valid_player(player_id):
            self.send_json(400, {"error": "bad_player_id"})
            return
        if not supabase_configured():
            self.send_json(503, {"error": "backend_not_configured", "progress": None})
            return
        status, body = supabase_request(
            "GET",
            f"/rest/v1/saves?player_id=eq.{urllib.parse.quote(player_id)}"
            "&select=progress,updated_at",
        )
        if status != 200:
            log("supabase load failed:", status, body[:200])
            tg_alert(f"zigzag: load failed {status} for {player_id[:12]}")
            self.send_json(502, {"error": "storage_error", "progress": None})
            return
        try:
            rows = json.loads(body)
        except ValueError:
            rows = []
        progress = rows[0].get("progress") if rows else None
        self.send_json(200, {"progress": progress})

    def handle_save(self):
        data = self.read_json()
        if not data:
            self.send_json(400, {"error": "bad_json"})
            return
        player_id, progress = data.get("player_id"), data.get("progress")
        if not valid_player(player_id):
            self.send_json(400, {"error": "bad_player_id"})
            return
        if not valid_progress(progress):
            self.send_json(400, {"error": "bad_progress"})
            return
        if not supabase_configured():
            self.send_json(503, {"error": "backend_not_configured"})
            return
        status, body = supabase_request(
            "POST",
            "/rest/v1/saves",
            {
                "player_id": player_id,
                "progress": progress,
                "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
        )
        if status not in (200, 201, 204):
            log("supabase save failed:", status, body[:200])
            tg_alert(f"zigzag: save failed {status} for {player_id[:12]}")
            self.send_json(502, {"error": "storage_error"})
            return
        self.send_json(200, {"ok": True})

    # --- static ---
    def serve_static(self, path):
        name = path.lstrip("/").split("?")[0].split("#")[0]
        if name in ("", "pikabu.html", "zigzag.html"):
            name = "index.html"
        if name not in STATIC_FILES or "/" in name or "\\" in name or ".." in name:
            self.send_response(404)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"not found")
            return
        full = os.path.join(ROOT, name)
        try:
            with open(full, "rb") as fh:
                data = fh.read()
        except OSError:
            self.send_response(404)
            self.end_headers()
            return
        ext = os.path.splitext(name)[1]
        self.send_response(200)
        self.send_header("Content-Type", MIME.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        if name in ("index.html", "shag.html"):
            self.send_header("Cache-Control", "no-cache, must-revalidate")
        else:
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        self.end_headers()
        self.wfile.write(data)


def parse_qs_first(query):
    return {k: v[0] if v else "" for k, v in urllib.parse.parse_qs(query).items()}


def main():
    if not supabase_configured():
        log("WARNING: SUPABASE_URL/SUPABASE_SERVICE_KEY not set — /api/* returns 503, static works")
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    log(f"zigzag on 0.0.0.0:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
