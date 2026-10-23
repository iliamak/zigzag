## 2026-10-15 - Missing Rate Limiting and In-Memory Protection

**Vulnerability:**
The application lacked rate limiting on sensitive endpoints (`/api/load` and `/api/save`), making it susceptible to DoS attacks and brute-forcing.

**Learning:**
Because the application cannot use external dependencies like Redis and operates behind proxies (Bothost/Vercel), implementing an in-memory dictionary-based rate limiter introduces risks of memory exhaustion (DoS). Additionally, true client IP must be identified correctly. We learned to extract the right-most IP in the `X-Forwarded-For` header to prevent spoofing and implement periodic garbage collection of stale rate limit entries.

**Prevention:**
Always validate true client IP behind a proxy. When creating in-memory state tracking, implement a sliding window and scheduled/periodic cleanup logic (garbage collection) to prevent unbounded memory growth.

## 2023-10-23 - Валидация типов JSON и защита от необработанных исключений

**Vulnerability (Уязвимость):**
API эндпоинт `handle_save` в `server.py` парсил входящие данные JSON, но не проверял результирующий тип перед доступом к его свойствам. Если передавался массив или строка (например, `[1, 2, 3]`), вызов `.get("player_id")` приводил к `AttributeError`, вызывая необработанное исключение. Это раскрывало трассировку стека и создавало потенциальную уязвимость типа "Отказ в обслуживании" (DoS) из-за сбоев приложения или неограниченного логирования ошибок.

**Learning (Урок):**
Использование `json.loads()` для валидного JSON, такого как `[1, 2]`, возвращает список, а не словарь. Предположение о том, что объект верхнего уровня всегда является словарем, и прямой вызов методов словаря для него может привести к сбою внутреннего сервера при получении вредоносных или некорректных полезных нагрузок.

**Prevention (Предотвращение):**
Всегда явно проверяйте тип разобранного объекта JSON (например, с помощью `isinstance(data, dict)`) после `json.loads()` и перед попыткой доступа к ожидаемым свойствам.
