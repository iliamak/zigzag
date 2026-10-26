## 2026-10-15 - Missing Rate Limiting and In-Memory Protection

**Vulnerability:**
The application lacked rate limiting on sensitive endpoints (`/api/load` and `/api/save`), making it susceptible to DoS attacks and brute-forcing.

**Learning:**
Because the application cannot use external dependencies like Redis and operates behind proxies (Bothost/Vercel), implementing an in-memory dictionary-based rate limiter introduces risks of memory exhaustion (DoS). Additionally, true client IP must be identified correctly. We learned to extract the right-most IP in the `X-Forwarded-For` header to prevent spoofing and implement periodic garbage collection of stale rate limit entries.

**Prevention:**
Always validate true client IP behind a proxy. When creating in-memory state tracking, implement a sliding window and scheduled/periodic cleanup logic (garbage collection) to prevent unbounded memory growth.

## 2026-10-26 - Missing JSON Type Validation (DoS Risk)
**Vulnerability:**
The application crashed with an `AttributeError` when a JSON array or unexpected type was sent to the `/api/save` endpoint, as it assumed the parsed JSON `data` object was a dictionary and called `.get()` on it. This crash led to a 500 internal server error and could be exploited for DoS by continuously crashing request threads.

**Learning:**
Always explicitly check the type of parsed JSON payloads using `isinstance(data, dict)` after calling `json.loads()` and before accessing properties. Simply checking `if not data:` is insufficient because arrays (`[]`, `[1, 2]`) and numbers (`123`) are truthy or valid JSON objects but will raise exceptions if treated like dictionaries.

**Prevention:**
Enforce strict type checking on all incoming deserialized data structures before interacting with their properties or methods, ensuring gracefully failing error responses (e.g., HTTP 400) instead of unhandled exceptions.
