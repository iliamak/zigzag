## 2026-10-15 - Missing Rate Limiting and In-Memory Protection

**Vulnerability:**
The application lacked rate limiting on sensitive endpoints (`/api/load` and `/api/save`), making it susceptible to DoS attacks and brute-forcing.

**Learning:**
Because the application cannot use external dependencies like Redis and operates behind proxies (Bothost/Vercel), implementing an in-memory dictionary-based rate limiter introduces risks of memory exhaustion (DoS). Additionally, true client IP must be identified correctly. We learned to extract the right-most IP in the `X-Forwarded-For` header to prevent spoofing and implement periodic garbage collection of stale rate limit entries.

**Prevention:**
Always validate true client IP behind a proxy. When creating in-memory state tracking, implement a sliding window and scheduled/periodic cleanup logic (garbage collection) to prevent unbounded memory growth.

## 2026-10-19 - Unhandled Exception DoS from Unexpected JSON Types
**Vulnerability:**
The `/api/save` endpoint accepted JSON payloads but failed to validate the parsed Python object type (e.g., assuming a dictionary). When an array was provided, `.get()` caused an `AttributeError` which crashed the request thread, serving as a DoS vulnerability.
**Learning:**
Even with standard libraries like `json.loads()`, parsing valid JSON does not guarantee a specific structure (like an object/dict). Python's `ThreadingHTTPServer` may fail gracefully for the main thread, but exceptions in handlers can still be disruptive and lead to 500 errors or thread exhaustion if not caught.
**Prevention:**
Always validate the parsed JSON object type (e.g., `isinstance(data, dict)`) immediately after deserialization and before accessing its properties.
