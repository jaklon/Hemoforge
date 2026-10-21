FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir fastapi==0.156.4 uvicorn==0.54.0 httpx==0.28.1
RUN useradd --system --uid 10001 --create-home hemobot
COPY backend/__init__.py backend/http_limits.py /app/backend/
COPY deploy/gateway.py /app/deploy/gateway.py
USER hemobot
EXPOSE 8080
CMD ["python", "-m", "uvicorn", "deploy.gateway:app", "--host", "0.0.0.0", "--port", "8080", "--no-access-log", "--limit-concurrency", "12", "--timeout-keep-alive", "5"]
