# Важно: WORKDIR вне /app — Bothost при старте монтирует в /app
# слепок исходников из Git (может быть старым), он бы перекрыл файлы образа.
FROM python:3.12-alpine
WORKDIR /srv/app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py index.html levels.build.json shag.html ./
EXPOSE 8000
CMD ["python", "server.py"]
