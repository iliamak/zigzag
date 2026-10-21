## 2026-10-15 - Missing Rate Limiting and In-Memory Protection

**Vulnerability:**
The application lacked rate limiting on sensitive endpoints (`/api/load` and `/api/save`), making it susceptible to DoS attacks and brute-forcing.

**Learning:**
Because the application cannot use external dependencies like Redis and operates behind proxies (Bothost/Vercel), implementing an in-memory dictionary-based rate limiter introduces risks of memory exhaustion (DoS). Additionally, true client IP must be identified correctly. We learned to extract the right-most IP in the `X-Forwarded-For` header to prevent spoofing and implement periodic garbage collection of stale rate limit entries.

**Prevention:**
Always validate true client IP behind a proxy. When creating in-memory state tracking, implement a sliding window and scheduled/periodic cleanup logic (garbage collection) to prevent unbounded memory growth.

## 2026-10-21 - Unhandled Exception in JSON Deserialization

**Vulnerability:**
The `/api/save` endpoint assumed that the successfully parsed JSON from a POST request was a dictionary before attempting to access its properties via `.get()`. However, if an attacker sent a valid JSON array (e.g., `[1, 2, 3]`), the `json.loads()` method would successfully parse it, but subsequent `.get()` calls would trigger an `AttributeError` causing an unhandled exception and a 500/Connection Reset, opening a potential Denial of Service (DoS) attack vector.

**Learning:**
Successfully parsing JSON does not guarantee the structure or type of the object. Python's `json.loads()` can return lists, dictionaries, strings, numbers, booleans, or null depending on the input. We learned that accessing methods specific to a certain data type (like `.get()` on a dict) without prior type validation leads to unhandled exceptions.

**Prevention:**
Always validate the expected data type of the parsed JSON object immediately after deserialization and before accessing its contents. For example, use `if not isinstance(data, dict):` instead of `if not data:` to enforce the expected structure and prevent type-related exceptions.
