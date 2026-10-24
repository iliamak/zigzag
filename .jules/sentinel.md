## 2026-10-15 - Missing Rate Limiting and In-Memory Protection

**Vulnerability:**
The application lacked rate limiting on sensitive endpoints (`/api/load` and `/api/save`), making it susceptible to DoS attacks and brute-forcing.

**Learning:**
Because the application cannot use external dependencies like Redis and operates behind proxies (Bothost/Vercel), implementing an in-memory dictionary-based rate limiter introduces risks of memory exhaustion (DoS). Additionally, true client IP must be identified correctly. We learned to extract the right-most IP in the `X-Forwarded-For` header to prevent spoofing and implement periodic garbage collection of stale rate limit entries.

**Prevention:**
Always validate true client IP behind a proxy. When creating in-memory state tracking, implement a sliding window and scheduled/periodic cleanup logic (garbage collection) to prevent unbounded memory growth.

## 2026-10-24 - Unhandled JSON Object Types (DoS Risk)
**Vulnerability:** The `/api/save` endpoint accepted JSON payloads without validating the top-level type. If a JSON array was sent, `json.loads` would parse it as a list, leading to an `AttributeError` when `.get()` was called, potentially crashing the request handler thread or causing DoS.
**Learning:** `json.loads` can return lists, strings, or numbers if valid JSON, not just dictionaries. We cannot assume the parsed JSON is a dictionary before calling dictionary-specific methods.
**Prevention:** Always validate the type of the parsed JSON (e.g., `isinstance(data, dict)`) before attempting to access its properties.
