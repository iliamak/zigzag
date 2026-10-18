## 2026-10-15 - Missing Rate Limiting and In-Memory Protection

**Vulnerability:**
The application lacked rate limiting on sensitive endpoints (`/api/load` and `/api/save`), making it susceptible to DoS attacks and brute-forcing.

**Learning:**
Because the application cannot use external dependencies like Redis and operates behind proxies (Bothost/Vercel), implementing an in-memory dictionary-based rate limiter introduces risks of memory exhaustion (DoS). Additionally, true client IP must be identified correctly. We learned to extract the right-most IP in the `X-Forwarded-For` header to prevent spoofing and implement periodic garbage collection of stale rate limit entries.

**Prevention:**
Always validate true client IP behind a proxy. When creating in-memory state tracking, implement a sliding window and scheduled/periodic cleanup logic (garbage collection) to prevent unbounded memory growth.

## 2026-10-18 - Unhandled Exception via JSON Type Confusion
**Vulnerability:**
The `/api/save` endpoint in `server.py` assumed the parsed JSON payload would always be a dictionary. Passing a JSON array (e.g., `["test"]`) caused an `AttributeError` when attempting to access `.get()`, crashing the request thread and causing a 502/empty reply.

**Learning:**
When using `json.loads()`, the resulting object can be various types (dictionary, list, string, int, etc.) depending on the client's payload. Accessing dictionary-specific properties on an unvalidated type leads to unhandled exceptions which can be exploited for DoS vulnerabilities.

**Prevention:**
Always validate the object type (e.g., `isinstance(data, dict)`) directly after `json.loads()` and before attempting to access expected keys or properties.
