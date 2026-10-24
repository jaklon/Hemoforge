#!/usr/bin/env bash
# Pull, rebuild and restart hemoforge.my.id. Run inside the arch-friend container:
#   bash deploy/update-server.sh
# openresty forwards to port 3001 (built site); /api goes on to the API on 8000.
# setsid: without it the servers die when the docker exec session ends.
set -euo pipefail

# Wrapped in a function so bash reads the whole file before git pull can rewrite it.
main() {
  cd "$(dirname "$0")/.."
  git pull --ff-only
  # *.png etc. are Git LFS (.gitattributes); without this public/ ships pointer files.
  git lfs pull
  .venv/bin/python -m pip install -q -r requirements.txt
  pnpm install --frozen-lockfile
  npm run build

  pkill -f "uvicorn backend.api" || true
  pkill -f vite || true
  sleep 1
  mkdir -p logs
  HEMOBOT_ALLOWED_HOSTS=hemoforge.my.id \
    setsid nohup .venv/bin/python -m uvicorn backend.api:app --host 0.0.0.0 --port 8000 --no-access-log > logs/api.log 2>&1 &
  PORT=3001 FIGMA_DEV_SERVER_HOST=0.0.0.0 __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=hemoforge.my.id \
    setsid nohup npx vite preview > logs/vite.log 2>&1 &

  curl -fsS --retry 10 --retry-connrefused --retry-delay 1 -H "Host: hemoforge.my.id" http://127.0.0.1:3001/api/health
  echo
  echo "Live. Logs: logs/api.log, logs/vite.log"
}

main "$@"
