# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# JobPilot image — builds the React frontend and the browser extension, then
# serves the API + UI + WebSocket on port 1456 from a single Python runtime.
# Build context is the REPO ROOT (see docker-compose.yml).
# ---------------------------------------------------------------------------

# ---- Stage 1: build the React frontend into backend/app/static ----
FROM node:22-slim AS frontend-build
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
# vite.config outDir = ../backend/app/static — create the sibling target first.
RUN mkdir -p /build/backend/app/static && npm run build

# ---- Stage 2: build the Chrome + Firefox extension bundles ----
FROM node:22-slim AS ext-build
ARG EXTENSION_VERSION=1.0.0
ENV EXTENSION_VERSION=${EXTENSION_VERSION}
WORKDIR /build/extension
COPY extension/package*.json ./
RUN npm install --no-audit --no-fund
COPY extension/ ./
# `bundle` builds both targets and copies jobpilot-chrome.zip / jobpilot-firefox.xpi
# into ../backend/app/static/extension. Never fail the image if packaging hiccups.
RUN mkdir -p /build/backend/app/static/extension && (npm run bundle || echo "extension bundle step reported issues; continuing")

# ---- Stage 3: Python runtime ----
FROM python:3.12-slim AS runtime
ARG INSTALL_BROWSERS=false
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

# Optional: install the Chromium browser for the live server-side executor + noVNC.
# Default off to keep the image lean and the build reliable; set --build-arg INSTALL_BROWSERS=true to enable.
RUN if [ "$INSTALL_BROWSERS" = "true" ]; then playwright install --with-deps chromium; fi

# App source
COPY backend/ ./

# Built frontend (index.html + assets) and extension bundles from the earlier stages.
COPY --from=frontend-build /build/backend/app/static /app/app/static
COPY --from=ext-build /build/backend/app/static/extension /app/app/static/extension

RUN chmod +x /app/entrypoint.sh || true
EXPOSE 1456
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "1456"]
