#!/bin/sh
# Entrypoint: run DB migrations + optional seed (app service only), then exec the command.
set -e

cd /app

if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
  echo "[entrypoint] Applying database migrations..."
  alembic upgrade head || {
    echo "[entrypoint] alembic failed; falling back to create_all"
    python -c "from app.db import init_db; init_db()"
  }
  if [ "${SEED_ON_START:-false}" = "true" ]; then
    echo "[entrypoint] Seeding demo data..."
    python -m app.seed || echo "[entrypoint] seed reported issues; continuing"
  fi
fi

echo "[entrypoint] Starting: $*"
exec "$@"
