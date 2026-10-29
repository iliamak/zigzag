## 2026-10-15 - Missing Rate Limiting and In-Memory Protection

**Vulnerability:**
The application lacked rate limiting on sensitive endpoints (`/api/load` and `/api/save`), making it susceptible to DoS attacks and brute-forcing.

**Learning:**
Because the application cannot use external dependencies like Redis and operates behind proxies (Bothost/Vercel), implementing an in-memory dictionary-based rate limiter introduces risks of memory exhaustion (DoS). Additionally, true client IP must be identified correctly. We learned to extract the right-most IP in the `X-Forwarded-For` header to prevent spoofing and implement periodic garbage collection of stale rate limit entries.

**Prevention:**
Always validate true client IP behind a proxy. When creating in-memory state tracking, implement a sliding window and scheduled/periodic cleanup logic (garbage collection) to prevent unbounded memory growth.
## 2024-10-29 - [Unhandled Exception DoS via JSON Array]
**Vulnerability:** The application blindly called `data.get()` on parsed JSON input in `/api/save` without validating that the parsed output was actually a dictionary, resulting in an `AttributeError` crashing the request thread when a JSON array was submitted.
**Learning:** `json.loads()` can return a dictionary, list, string, integer, float, or boolean. If the backend expects a dictionary (JSON object) and receives a list (JSON array), accessing it with `.get()` or dictionary keys causes a crash, creating a DoS vulnerability.
**Prevention:** Always validate the type of the parsed JSON object (e.g., `isinstance(data, dict)`) immediately after `json.loads()` and before attempting to access its properties.
