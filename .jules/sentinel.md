## 2026-10-15 - Missing Rate Limiting and In-Memory Protection

**Vulnerability:**
The application lacked rate limiting on sensitive endpoints (`/api/load` and `/api/save`), making it susceptible to DoS attacks and brute-forcing.

**Learning:**
Because the application cannot use external dependencies like Redis and operates behind proxies (Bothost/Vercel), implementing an in-memory dictionary-based rate limiter introduces risks of memory exhaustion (DoS). Additionally, true client IP must be identified correctly. We learned to extract the right-most IP in the `X-Forwarded-For` header to prevent spoofing and implement periodic garbage collection of stale rate limit entries.

**Prevention:**
Always validate true client IP behind a proxy. When creating in-memory state tracking, implement a sliding window and scheduled/periodic cleanup logic (garbage collection) to prevent unbounded memory growth.

## 2024-10-27 - Unhandled Exception DoS via JSON Type Confusion

**Vulnerability:**
The `/api/save` endpoint accepted JSON payloads without verifying their type before accessing dictionary methods (`.get()`). Passing a JSON array instead of an object resulted in an unhandled `AttributeError`, causing the request thread to crash and closing the connection without a response, representing a DoS vulnerability.

**Learning:**
When using `json.loads()`, the resulting parsed object type can be arbitrary depending on the input (e.g., list, string, number, rather than dict). Assuming the payload is a dictionary without validation leads to unhandled exceptions when dictionary-specific methods are called.

**Prevention:**
Always validate the parsed JSON object type (e.g., `isinstance(data, dict)`) after `json.loads()` and before accessing properties to prevent unexpected JSON types from causing unhandled exceptions or DoS vulnerabilities.
