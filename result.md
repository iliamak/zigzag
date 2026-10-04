# Аудит производительности и безопасности (Zig Zag / Шаг)

## 1. Сводная таблица найденных проблем

| Приоритет | Файл : Строка | Проблема | Влияние (Impact) | Решение (Fix) |
| :--- | :--- | :--- | :--- | :--- |
| **P0-critical** | `server.py:237` | Отсутствие кэширования статики. Заголовок `Cache-Control: public, max-age=0, must-revalidate` заставляет браузер всегда перепроверять ресурсы. | Существенная просадка производительности, повторные запросы, ухудшение показателей LCP и FCP. | Разделить политики кеширования: `no-cache` для `index.html` и долгий (immutable) кэш для неизменяемых ресурсов. |
| **P0-critical** | `server.py:244-248` | Отсутствуют заголовки безопасности (Security Headers). | Снижение базовой защиты от XSS, MIME-sniffing, Clickjacking. Уязвимость к атакам. | Добавить заголовки `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (или SAMEORIGIN для VK Bridge), и настроенный `Content-Security-Policy`. |
| **P1-high** | `index.html:1659` | Использование `innerHTML` без полноценного санирования. `escapeHTML` обрабатывает только малую часть спецсимволов. | Риск XSS, если `packet.n` (имя пользователя) или другие инжектируемые данные окажутся скомпрометированными. | Повсеместное использование `textContent` вместо `innerHTML` или внедрение надежной библиотеки санирования. Гарантировать пропуск всех пользовательских строк через `escapeHTML`. |
| **P1-high** | `server.py:187` | IDOR (Insecure Direct Object Reference) в `/api/load?player_id=` и `/api/save`. Любой пользователь может получить или перезаписать чужое сохранение по известному/подобранному `player_id`. | Потеря конфиденциальности, подмена данных, нарушение целостности игровых сохранений. | Внедрить Rate Limiter (с использованием `X-Forwarded-For`), так как изменение формата сохранения сломает обратную совместимость (старые сейвы без подписей). |
| **P1-high** | `shag.html:14` | Tailwind Browser v4 (через CDN) парсится в рантайме. Синхронная загрузка JS. | Замедление First Contentful Paint (FCP) и блокировка основного потока при парсинге HTML-файла объемом ~2100 строк. | Переход на предварительную сборку Tailwind CLI или хотя бы отложенную загрузку скрипта (defer). |
| **P2-nit** | `index.html:1869` | Обработчики событий (особенно `pointermove` и `touchmove`) срабатывают чаще частоты кадров дисплея. | Избыточные вызовы обновления SVG-линий, Layout Thrashing, падение FPS (особенно на мобильных). | Ограничить частоту вызовов через `requestAnimationFrame` или дросселирование (throttling) для отрисовки пути. |
| **P2-nit** | `server.py:112` | Отсутствие пула подключений к БД (Supabase) и неиспользование `Session` из `requests` / in-memory кеширования статики. | Дополнительные накладные расходы на TCP-handshake с Supabase при каждом API-вызове и постоянные I/O диска при чтении статики `open().read()`. | Добавить in-memory кеширование статических файлов в Python и рассмотреть переиспользование HTTP-подключений (хотя бы в рамках одного потока). |

## 2. Предлагаемые изменения (PR-ready Diffs для P0)

### 2.1. Security Headers и улучшение Cache-Control в `server.py`

В текущей версии `server.py` отдаются заголовки, не обеспечивающие кэширование, и отсутствуют базовые заголовки безопасности, что увеличивает риск атак и негативно сказывается на FCP/LCP.

```diff
--- server.py
+++ server.py
@@ -234,6 +234,10 @@
         self.send_header("Content-Type", MIME.get(ext, "application/octet-stream"))
         self.send_header("Content-Length", str(len(data)))
-        self.send_header("Cache-Control", "public, max-age=0, must-revalidate")
+        if name == "index.html":
+            self.send_header("Cache-Control", "no-cache, must-revalidate")
+        else:
+            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
+        self.send_header("X-Content-Type-Options", "nosniff")
+        self.send_header("X-Frame-Options", "DENY")
+        self.send_header("Content-Security-Policy", "default-src 'self' https://games.pikabu.ru https://fonts.googleapis.com https://fonts.gstatic.com; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://games.pikabu.ru; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:;")
         self.end_headers()
         self.wfile.write(data)
```

В заголовки API также добавим базовые директивы для снижения поверхности атак:
```diff
--- server.py
+++ server.py
@@ -107,6 +107,8 @@
         origin = self.origin_allowed()
         if origin:
             self.send_header("Access-Control-Allow-Origin", origin)
             self.send_header("Vary", "Origin")
+        self.send_header("X-Content-Type-Options", "nosniff")
+        self.send_header("X-Frame-Options", "DENY")
         for key, value in (extra or {}).items():
             self.send_header(key, value)
```

### 2.2. Защита IDOR и Rate Limit в `server.py` (P1-high)
Уязвимость IDOR в `/api/save` и `/api/load` не может быть полностью исправлена авторизационными токенами без нарушения совместимости со старыми сохранениями (так требует документация). Оптимальный компромисс для публичных API — Rate Limiting по IP. Мы используем заголовок `X-Forwarded-For` для учета прокси-серверов (Vercel).

```diff
--- server.py
+++ server.py
@@ -34,6 +34,22 @@
 _last_tg_alert = 0.0

+import threading
+RATE_LIMITS = {}
+RATE_LIMIT_LOCK = threading.Lock()
+def check_rate_limit(handler, limit=30, period=60):
+    ip = handler.headers.get("X-Forwarded-For", handler.client_address[0]).split(",")[0].strip()
+    now = time.time()
+    with RATE_LIMIT_LOCK:
+        times = RATE_LIMITS.get(ip, [])
+        # Очистка старых метрик для избежания утечек памяти
+        times = [t for t in times if now - t < period]
+        if len(times) >= limit:
+            RATE_LIMITS[ip] = times
+            return False
+        times.append(now)
+        RATE_LIMITS[ip] = times
+        return True
+
 MIME = {
@@ -187,6 +203,9 @@
     def handle_load(self, query):
+        if not check_rate_limit(self, limit=30, period=60):
+            self.send_json(429, {"error": "too_many_requests"})
+            return
         player_id = query.get("player_id", "")
         if not valid_player(player_id):
@@ -212,6 +231,9 @@
     def handle_save(self):
+        if not check_rate_limit(self, limit=30, period=60):
+            self.send_json(429, {"error": "too_many_requests"})
+            return
         data = self.read_json()
```

## 3. Детальный разбор (Спецификация)

### 3.1. Производительность (Performance Audit)
- **Frontend FCP & LCP**: Страница состоит из ~2100 строк единого HTML. Использование Tailwind Browser v4 означает парсинг стилей во время выполнения, что блокирует основной поток на устройствах со слабыми CPU, увеличивая FCP (First Contentful Paint). Кроме того, синхронная загрузка `sdk.js` и рендер-блокирующая логика шрифтов `media="all"` (в некоторых ситуациях) может замедлить LCP. **Решение**: Рекомендуется предсобирать стили или использовать отложенную загрузку скриптов (`defer`).
- **Runtime Bottlenecks**: В функции `pointermove` (в `index.html`) происходит частое вычисление и перерисовка пути. Отсутствие `requestAnimationFrame` может привести к накоплению событий и Layout Thrashing, особенно при масштабировании игрового поля до 7x7. Постоянная перерисовка SVG также усугубляет проблему. Рекомендуется объединять изменения (batching).
- **Backend Latency & Threading**: `ThreadingHTTPServer` не использует Connection Pooling (кэш соединений HTTP). Функция `supabase_request()` создает новый TCP/TLS запрос к Supabase REST API для каждого сохранения/загрузки. Это добавляет ощутимую латентность (~100-200мс на рукопожатие). Использование библиотеки вроде `urllib3` с пулом соединений или `requests.Session` решило бы эту проблему.
- **Backend Static I/O**: `open().read()` при каждом запросе на отдачу статики `serve_static` создает постоянную нагрузку I/O на дисковую систему сервера. Для статических файлов с малым объемом (как в данном случае) лучше реализовать in-memory кэш-словарь для их отдачи.

### 3.2. Безопасность (Security Audit)
- **XSS & DOM Manipulation**: Существует потенциальная угроза XSS через присваивание в `innerHTML` в диалоговых окнах (особенно в `openDialog`). На данный момент вызов `escapeHTML()` предотвращает XSS инъекции через `packet.n` или другие импортированные переменные. Тем не менее, самопальный `escapeHTML` заменяет только базовые символы. Если будут добавлены сложные инъекции стилей, он не справится. Использование встроенного `textContent` для текста и раздельное формирование структуры безопаснее.
- **IDOR Vulnerability**: Endpoint `/api/save` позволяет перезаписывать прогресс любого пользователя (`valid_player` лишь проверяет Regex регулярное выражение, без верификации авторства). Это позволяет злоумышленнику сбросить чужой прогресс или накрутить результаты. Так как авторизация на сервере отсутствует, а внедрять её нельзя для старых сохранений, введение строгого Rate Limiter — единственное доступное решение для сдерживания масштабных автоматизированных атак (перебор ID).
- **Backend Hardening**: Базовые проверки, такие как путь `serve_static()` защищен проверкой списка `STATIC_FILES` на предмет отсутствия спецсимволов и выхода из директории (`..`). Попадание в ловушку Path Traversal невозможно благодаря этой проверке allow-list-а, и файл с решениями уровней (`levels.json`) никогда не будет отдан. Но безопасность заголовков, как упомянуто, нуждается в доработке (отсутствие CSP/X-Content-Type-Options).
- **Секреты и Логи**: Проверена возможность утечки ключа `SUPABASE_SERVICE_KEY`. За счет архитектуры он используется исключительно сервером. В логах (`server.py:log()`) обрезается до первых 200 символов, что предотвращает утечку гигантских нагрузок, но `player_id` всё же логируется. Это может стать проблемой, если логи доступны злоумышленникам. Инъекция `TG_BOT_TOKEN` защищена обрезанием текста (`text[:3500]`), однако сам факт отправки нефильтрованного текста может привести к Telegram Markdown инъекциям (если бы бот его использовал).
- **SDK и PostMessage Validation**: Pikabu SDK и VK Bridge используют `postMessage`. При отсутствии валидации Origin злоумышленники могут имитировать ответы платформы, однако вызовы SDK обернуты в обещания с таймаутом `pkbTimeout(promise, 3500)`, что частично минимизирует риски длительного зависания (DoS).
