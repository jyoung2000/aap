"""JobPilot FastAPI application — serves the UI, API, and WebSockets on port 1456."""
from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .db import init_db
from .redis_bus import run_subscriber
from .ws_manager import manager

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("jobpilot")

STATIC_DIR = Path(__file__).resolve().parent / "static"
INDEX_HTML = STATIC_DIR / "index.html"

_subscriber_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _subscriber_task
    try:
        init_db()
    except Exception as exc:  # migrations may run separately; don't crash on boot
        log.warning("init_db skipped: %s", exc)
    _subscriber_task = asyncio.create_task(run_subscriber(manager))
    log.info("JobPilot started on port %s", settings.app_port)
    yield
    if _subscriber_task:
        _subscriber_task.cancel()


app = FastAPI(title="JobPilot", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"^(chrome-extension|moz-extension)://.*$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Routers ----
from .api import (  # noqa: E402
    analytics,
    applications,
    auth,
    export,
    ext_api,
    extension,
    profile,
    search,
    ws,
)

for module in (auth, profile, search, applications, ext_api, extension, analytics, export):
    app.include_router(module.router)
app.include_router(ws.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "app": settings.app_name, "version": app.version, "llm": settings.llm_enabled}


# ---- Static assets (frontend build) + media (screenshots) ----
if (STATIC_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")
try:
    app.mount("/media", StaticFiles(directory=settings.screenshot_dir), name="media")
except Exception:
    pass


@app.get("/{full_path:path}", include_in_schema=False)
def spa(full_path: str):
    """Serve the built SPA; fall back to a placeholder before the frontend is built."""
    # Static files that actually exist (favicon, manifest, etc.)
    candidate = STATIC_DIR / full_path
    if full_path and candidate.is_file():
        return FileResponse(candidate)
    if INDEX_HTML.exists():
        return FileResponse(INDEX_HTML)
    return HTMLResponse(
        f"""<!doctype html><html><head><meta charset=utf-8><title>{settings.app_name}</title>
        <style>body{{font-family:-apple-system,Inter,sans-serif;background:#0b0f17;color:#e5e7eb;
        display:grid;place-items:center;height:100vh;margin:0}}.c{{max-width:640px;padding:2rem;text-align:center}}
        code{{background:#1f2937;padding:.15rem .4rem;border-radius:6px}}</style></head>
        <body><div class=c><h1>{settings.app_name}</h1>
        <p>The API is running. The frontend has not been built yet.</p>
        <p>Run <code>cd frontend && npm install && npm run build</code>, or use
        <code>docker compose up</code> which builds and serves the UI automatically.</p>
        <p><a style="color:#3b82f6" href="/docs">Open the API docs →</a></p></div></body></html>""",
        status_code=200,
    )
