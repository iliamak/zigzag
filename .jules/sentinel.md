## 2026-10-15 - Missing Rate Limiting and In-Memory Protection

**Vulnerability:**
The application lacked rate limiting on sensitive endpoints (`/api/load` and `/api/save`), making it susceptible to DoS attacks and brute-forcing.

**Learning:**
Because the application cannot use external dependencies like Redis and operates behind proxies (Bothost/Vercel), implementing an in-memory dictionary-based rate limiter introduces risks of memory exhaustion (DoS). Additionally, true client IP must be identified correctly. We learned to extract the right-most IP in the `X-Forwarded-For` header to prevent spoofing and implement periodic garbage collection of stale rate limit entries.

**Prevention:**
Always validate true client IP behind a proxy. When creating in-memory state tracking, implement a sliding window and scheduled/periodic cleanup logic (garbage collection) to prevent unbounded memory growth.

## 2024-05-24 - Unhandled Exception in JSON Processing

**Vulnerability:**
The `handle_save` endpoint in `server.py` parsed JSON payloads using `json.loads()` but assumed the result was a dictionary. If an attacker sent a JSON array (e.g., `[1, 2, 3]`), the application attempted to call `.get()` on the list, throwing an unhandled `AttributeError` and causing a 500 error and thread crash (DoS risk).

**Learning:**
`json.loads()` can return Python lists, strings, integers, etc., depending on the JSON root element. It does not guarantee a dictionary.

**Prevention:**
Always validate the type of the parsed JSON object (e.g., `isinstance(data, dict)`) before accessing properties or assuming it behaves like a specific data structure.
