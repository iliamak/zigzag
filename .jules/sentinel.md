## 2026-10-15 - Missing Rate Limiting and In-Memory Protection

**Vulnerability:**
The application lacked rate limiting on sensitive endpoints (`/api/load` and `/api/save`), making it susceptible to DoS attacks and brute-forcing.

**Learning:**
Because the application cannot use external dependencies like Redis and operates behind proxies (Bothost/Vercel), implementing an in-memory dictionary-based rate limiter introduces risks of memory exhaustion (DoS). Additionally, true client IP must be identified correctly. We learned to extract the right-most IP in the `X-Forwarded-For` header to prevent spoofing and implement periodic garbage collection of stale rate limit entries.

**Prevention:**
Always validate true client IP behind a proxy. When creating in-memory state tracking, implement a sliding window and scheduled/periodic cleanup logic (garbage collection) to prevent unbounded memory growth.

## 2026-10-22 - [Missing JSON type validation DoS]
**Vulnerability:** В обработчике `handle_save` после вызова `json.loads` данные использовались без проверки типа. Отправка JSON массива (или строки) вызывала необработанное исключение `AttributeError: 'list' object has no attribute 'get'`, что могло привести к отказу в обслуживании (DoS) и падению процесса обработки в определенных конфигурациях.
**Learning:** Даже при валидном формате JSON необходимо обязательно проверять его тип (объект, массив, скалярное значение) перед доступом к свойствам. Функция `json.loads()` может вернуть списки, строки или числа.
**Prevention:** Всегда использовать конструкцию вида `if not isinstance(data, dict): return {"error": "bad_json"}` перед обращением к методам, специфичным для словарей (таким как `data.get()`), при разборе внешнего JSON-ввода.
