#!/usr/bin/env bash
# JobPilot — build & (re)deploy the full stack via docker compose.
# Safe to re-run; used by the unraid one-liner install/update command (see README).
set -euo pipefail

cd "$(dirname "$0")"
echo "==> JobPilot deploy starting in $(pwd)"

# --- 1. Ensure a .env exists with a strong secret + the server's LAN URL ---
if [ ! -f .env ]; then
  echo "==> Creating .env from .env.example"
  cp .env.example .env
  SECRET="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -z "${IP:-}" ] && IP="localhost"
  # portable in-place edits (GNU + BSD sed)
  sed -i.bak "s|^SECRET_KEY=.*|SECRET_KEY=${SECRET}|" .env && rm -f .env.bak
  sed -i.bak "s|^PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=http://${IP}:1456|" .env && rm -f .env.bak
  echo "==> .env created (SECRET_KEY generated, PUBLIC_BASE_URL=http://${IP}:1456)"
  echo "    Edit .env to add ANTHROPIC_API_KEY (optional) and aggregator keys."
fi

# --- 2. Pick the compose command ---
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  echo "!! docker compose not found. Install Docker + the compose plugin." >&2
  exit 1
fi

# --- 3. Build & launch ---
echo "==> Pulling base images (db, redis)"
$DC pull db redis || true
echo "==> Building JobPilot image (frontend + extension + backend)"
$DC build
echo "==> Starting services"
$DC up -d

echo
echo "======================================================================"
echo "  JobPilot is starting."
BASE_URL="$(grep -E '^PUBLIC_BASE_URL=' .env | cut -d= -f2- || true)"
echo "  Open:  ${BASE_URL:-http://localhost:1456}"
echo "  Demo login (seeded on first boot):  demo@jobpilot.local  /  demo12345"
echo "  Settings → Extension to download & pair the browser extension."
echo "======================================================================"
echo
$DC ps
