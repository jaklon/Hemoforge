#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
command -v docker >/dev/null || { echo 'Install Docker and Docker Compose first.' >&2; exit 1; }
docker compose version >/dev/null
umask 077
mkdir -p deploy/secrets
chmod 700 deploy/secrets
if [[ ! -s deploy/secrets/ollama_token.txt ]]; then
  od -An -N32 -tx1 /dev/urandom | tr -d ' \n' > deploy/secrets/ollama_token.txt
fi
# File-backed Compose secrets retain host permissions. The private parent directory
# protects the host copy; read-only mode allows the unprivileged container to read its mount.
chmod 444 deploy/secrets/ollama_token.txt
env_args=()
if [[ -f deploy/.env.local ]]; then env_args=(--env-file deploy/.env.local); fi
docker compose "${env_args[@]}" -f deploy/compose.models.yml config --quiet
docker compose "${env_args[@]}" -f deploy/compose.models.yml up --build -d --wait --wait-timeout 240
echo 'HemoBot models and authenticated gateway are ready.'
echo 'Gateway token: deploy/secrets/ollama_token.txt (copy privately into hemobot.local.json).'
echo 'The API is bound to HEMOBOT_BIND_IP (default loopback), port 11434.'
