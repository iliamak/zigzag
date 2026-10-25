## 2026-10-15 - Missing Rate Limiting and In-Memory Protection

**Vulnerability:**
The application lacked rate limiting on sensitive endpoints (`/api/load` and `/api/save`), making it susceptible to DoS attacks and brute-forcing.

**Learning:**
Because the application cannot use external dependencies like Redis and operates behind proxies (Bothost/Vercel), implementing an in-memory dictionary-based rate limiter introduces risks of memory exhaustion (DoS). Additionally, true client IP must be identified correctly. We learned to extract the right-most IP in the `X-Forwarded-For` header to prevent spoofing and implement periodic garbage collection of stale rate limit entries.

**Prevention:**
Always validate true client IP behind a proxy. When creating in-memory state tracking, implement a sliding window and scheduled/periodic cleanup logic (garbage collection) to prevent unbounded memory growth.

## 2025-02-28 - Unhandled Exception from Unexpected JSON Types

**Vulnerability:**
The `server.py` handler `read_json` method was parsing JSON payloads but failing to validate that the parsed data was actually a dictionary before returning it. If an array or string was provided, `.get()` calls on the resulting object (e.g. in `handle_save`) would raise an unhandled `AttributeError`, resulting in a 500 Internal Server Error.

**Learning:**
Parsing JSON only guarantees that the data is syntactically valid JSON. It does not guarantee the *type* of the root object (which could be an array, string, number, etc.). Relying on the parsed data being a dictionary without validation creates DoS vulnerabilities via application crashes.

**Prevention:**
Always validate the parsed JSON object type (e.g., `isinstance(data, dict)`) immediately after `json.loads()` and before accessing expected dictionary properties or methods like `.get()`.
