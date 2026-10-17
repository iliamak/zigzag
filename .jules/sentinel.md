## 2026-10-15 - Missing Rate Limiting and In-Memory Protection

**Vulnerability:**
The application lacked rate limiting on sensitive endpoints (`/api/load` and `/api/save`), making it susceptible to DoS attacks and brute-forcing.

**Learning:**
Because the application cannot use external dependencies like Redis and operates behind proxies (Bothost/Vercel), implementing an in-memory dictionary-based rate limiter introduces risks of memory exhaustion (DoS). Additionally, true client IP must be identified correctly. We learned to extract the right-most IP in the `X-Forwarded-For` header to prevent spoofing and implement periodic garbage collection of stale rate limit entries.

**Prevention:**
Always validate true client IP behind a proxy. When creating in-memory state tracking, implement a sliding window and scheduled/periodic cleanup logic (garbage collection) to prevent unbounded memory growth.

## 2026-10-17 - Missing JSON Input Type Validation

**Vulnerability:**
The application crashed due to a missing type check on the parsed JSON body in the POST `/api/save` endpoint. Sending a valid JSON array like `[1]` instead of a dictionary caused an `AttributeError` when attempting to call `.get("player_id")` on a `list` object, terminating the Python `ThreadingHTTPServer` worker thread or process depending on the environment, leading to a Denial of Service (DoS).

**Learning:**
Even if the `Content-Type` is validated and the payload is successfully parsed as JSON, the resulting object type is not guaranteed to be a dictionary. Any JSON type (array, string, number, boolean) can be successfully parsed. Failing to assert the expected type before using dict-specific methods (like `.get()`) leads to unhandled exceptions.

**Prevention:**
Always validate the instance type of parsed JSON data (e.g., `isinstance(data, dict)`) before interacting with it, ensuring that malicious or malformed payloads fail gracefully with a `400 Bad Request` instead of crashing the server.
