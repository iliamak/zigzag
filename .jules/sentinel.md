## 2026-10-15 - Missing Rate Limiting and In-Memory Protection

**Vulnerability:**
The application lacked rate limiting on sensitive endpoints (`/api/load` and `/api/save`), making it susceptible to DoS attacks and brute-forcing.

**Learning:**
Because the application cannot use external dependencies like Redis and operates behind proxies (Bothost/Vercel), implementing an in-memory dictionary-based rate limiter introduces risks of memory exhaustion (DoS). Additionally, true client IP must be identified correctly. We learned to extract the right-most IP in the `X-Forwarded-For` header to prevent spoofing and implement periodic garbage collection of stale rate limit entries.

**Prevention:**
Always validate true client IP behind a proxy. When creating in-memory state tracking, implement a sliding window and scheduled/periodic cleanup logic (garbage collection) to prevent unbounded memory growth.

## 2024-05-20 - DoS via Unexpected JSON Types in Request Body

**Vulnerability:**
The `/api/save` endpoint was vulnerable to a Denial of Service (DoS) attack where submitting an unexpected JSON type, such as an array `[1]`, would bypass early falsiness checks (`if not data:`), and cause an `AttributeError` when properties were accessed with `.get()`. This crashed the request handling thread because no overarching exception handler caught it before bubbling to the `socketserver`.

**Learning:**
Parsing JSON with `json.loads()` inherently accepts several types (dict, list, string, int, etc.). Relying solely on truthiness (`if not data:`) does not prevent arrays or other types from continuing through the function flow. When the application accesses expected properties (like `data.get(...)`), it must first assert the parsed object's type to avoid unhandled exceptions, especially in a backend running on a simple ThreadingHTTPServer.

**Prevention:**
Always explicitly validate the parsed object type (e.g., `isinstance(data, dict)`) immediately after `json.loads()` and before accessing properties. This prevents both application crashes (DoS) and potential vulnerabilities stemming from unexpected JSON structures.
