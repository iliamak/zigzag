# Спецификация для реализации (Агент)

Твоя задача — реализовать исправления из таблицы аудита (Пункт 1 и Пункт 5). Проект состоит из Python бэкенда (`server.py`) и `index.html`. Тебе не разрешается устанавливать сторонние библиотеки (`server.py` использует только стандартную библиотеку Python). Изменения не должны ломать обратную совместимость с сохранениями пользователей.

## Пункт 1: Кэширование статических файлов (P0-critical)

### Проблема:
В файле `server.py` в функции `serve_static` заголовки кэширования для статики настроены неэффективно:
Текущий код отдает: `Cache-Control: public, max-age=0, must-revalidate` для всех файлов.

### Требования к реализации:
1. Найди функцию `serve_static` в `server.py` (примерно строка 234).
2. Замени логику установки `Cache-Control`:
    - Для файла `index.html` и `shag.html` заголовок должен быть: `Cache-Control: no-cache, must-revalidate`.
    - Для всех остальных статических файлов (например, медиа, json): `Cache-Control: public, max-age=31536000, immutable`.
3. Реализуй эту логику через проверку переменной `name`.

Пример ожидаемого изменения:
```python
        if name in ("index.html", "shag.html"):
            self.send_header("Cache-Control", "no-cache, must-revalidate")
        else:
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
```

---

## Пункт 5: Оптимизация загрузки Tailwind и шрифтов (P1-high)

### Проблема:
В `index.html` и `shag.html` скрипт Tailwind Browser v4 (Pikabu SDK `sdk.js`) блокирует рендер, так как загружается синхронно. Также можно улучшить загрузку шрифтов для ускорения FCP.

### Требования к реализации:
1. В `index.html` найди строку `14`:
   `<script async src="https://games.pikabu.ru/sdk/sdk.js"></script>`
   (Или аналогичную без async). Измени её так, чтобы скрипт загружался с атрибутом `defer`:
   `<script defer src="https://games.pikabu.ru/sdk/sdk.js"></script>`
   (Если в файле есть другие сторонние скрипты, блокирующие рендер в <head>, также добавь им defer, но не трогай встроенный `script`).
2. При наличии `shag.html`, проверь его на то же самое и примени `defer` к загрузке SDK.

### Важно:
- После изменений запусти локальный сервер: `python3 -m http.server`
- Проверь, что `index.html?selftest=1` проходит без ошибок.
