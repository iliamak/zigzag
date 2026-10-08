
## 2026-10-08 - [Missing Rate Limit on Authentication/API Endpoints (DoS & Cost Exhaustion)]
**Vulnerability:** `/api/load` and `/api/save` lacked rate limiting, allowing arbitrary number of requests. Since the backend sits behind Vercel/Bothost proxies, standard IP extraction failed.
**Learning:** In-memory rate limiting was required as `server.py` cannot have external dependencies (no Redis). We needed to properly extract the right-most IP from `X-Forwarded-For` to prevent IP spoofing, and implement periodic cleanup to avoid memory exhaustion from tracking too many IPs.
**Prevention:** Always implement rate-limiting on unauthenticated or high-value endpoints. Extract client IPs safely from proxy headers (`X-Forwarded-For`). Any in-memory tracking structure must implement stale entry cleanup.
