# Build on the Arch server: both models are baked into the image before runtime.
ARG OLLAMA_IMAGE=ollama/ollama:0.40.6@sha256:40c61dbf5091e0b4cc46f406f912fb061cfeca51208f0f7173c87c3b5f795c95
FROM ${OLLAMA_IMAGE}
ARG CHAT_MODEL=hf.co/aaditya/OpenBioLLM-Llama3-8B-GGUF:Q4_K_M
ARG EMBEDDING_MODEL=nomic-embed-text
ENV OLLAMA_MODELS=/opt/ollama/models \
    OLLAMA_HOST=0.0.0.0:11434 \
    OLLAMA_NUM_PARALLEL=1 \
    OLLAMA_MAX_LOADED_MODELS=1 \
    OLLAMA_CONTEXT_LENGTH=8192 \
    OLLAMA_NO_CLOUD=1 \
    OLLAMA_KEEP_ALIVE=10m
RUN set -eu; \
    OLLAMA_HOST=127.0.0.1:11434 ollama serve >/tmp/ollama-build.log 2>&1 & service_pid=$!; \
    trap 'kill "$service_pid" 2>/dev/null || true' 0; \
    export OLLAMA_HOST=127.0.0.1:11434; \
    attempt=0; until ollama list >/dev/null 2>&1; do \
      attempt=$((attempt + 1)); [ "$attempt" -lt 60 ] || exit 1; sleep 1; \
    done; \
    ollama pull "$CHAT_MODEL"; \
    ollama pull "$EMBEDDING_MODEL"; \
    ollama show "$CHAT_MODEL" >/dev/null; \
    ollama show "$EMBEDDING_MODEL" >/dev/null
# Do not mount a new empty volume over /opt/ollama/models: that would hide the baked models.
