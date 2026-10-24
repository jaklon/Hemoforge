FROM node:22-bookworm-slim AS frontend
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install --global pnpm@11.25.0 && pnpm install --frozen-lockfile
COPY src ./src
COPY public ./public
COPY .figma/make/site.json ./.figma/make/site.json
COPY index.html vite.config.ts tsconfig.json ./
RUN pnpm build

FROM python:3.12-slim AS application
WORKDIR /app
RUN sed -i 's/Components: main$/Components: main contrib/' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install --no-install-recommends -y ttf-mscorefonts-installer && \
    test -f /usr/share/fonts/truetype/msttcorefonts/times.ttf && \
    test -f /usr/share/fonts/truetype/msttcorefonts/timesbd.ttf && \
    rm -rf /var/lib/apt/lists/*
COPY requirements.txt requirements-rag.txt ./
ARG INSTALL_RAG=true
RUN pip install --no-cache-dir -r requirements.txt && \
    if [ "$INSTALL_RAG" = true ]; then pip install --no-cache-dir -r requirements-rag.txt; fi
RUN useradd --system --uid 10001 --create-home hemobot && mkdir -p /app/data /app/knowledge/corpus && chown -R hemobot:hemobot /app/data /app/knowledge
COPY backend ./backend
COPY public/examples ./public/examples
COPY public/datasets/evo2 ./public/datasets/evo2
COPY --from=frontend /app/dist ./dist
USER hemobot
ENV HEMOBOT_RAG_PATH=/app/data/chroma \
    HEMOBOT_CORPUS_PATH=/app/knowledge/corpus \
    PYTHONDONTWRITEBYTECODE=1
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "backend.api:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log", "--limit-concurrency", "16"]
