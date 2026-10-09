## 2024-10-09 - DoS via Missing Rate Limiting and IP Spoofing
**Vulnerability:** The API endpoints lacked rate limiting, allowing attackers to overwhelm the backend (DoS). Furthermore, the application ran behind proxies without safely extracting the client's true IP, exposing it to IP spoofing.
**Learning:** Because the backend cannot use external dependencies like Redis, in-memory state tracking must implement periodic cleanup mechanisms to remove stale entries and prevent memory exhaustion. Also, always extract the right-most IP from `X-Forwarded-For` when behind trusted proxies to determine the true client.
**Prevention:** Implemented a memory-bounded rate limiter that periodically purges stale IPs and ensured true client IPs are correctly extracted from headers.
