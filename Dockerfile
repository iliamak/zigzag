# Зигзаг на Bothost: Python stdlib, без зависимостей.
FROM python:3.12-alpine
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py index.html levels.build.json shag.html ./
EXPOSE 8000
CMD ["python", "server.py"]
