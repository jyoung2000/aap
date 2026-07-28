"""WebSocket endpoints.

/ws/app  — the web UI (session-cookie auth). Receives live search/application/
           intervention events; sends screencast input for remote CAPTCHA solving.
/ws/ext  — the browser extension (device-token auth via ?token=). Streams a blocked
           tab's frames to the container and receives relayed input + queue signals.
"""
from __future__ import annotations

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from ..core.security import SESSION_COOKIE, hash_token
from ..db import SessionLocal, as_aware, utcnow
from ..models import Device, SessionToken
from ..redis_bus import publish
from ..ws_manager import manager

router = APIRouter()


def _user_from_session_cookie(cookie_token: str | None) -> str | None:
    if not cookie_token:
        return None
    db = SessionLocal()
    try:
        row = db.scalar(select(SessionToken).where(SessionToken.token_hash == hash_token(cookie_token)))
        if not row or as_aware(row.expires_at) <= utcnow():
            return None
        return row.user_id
    finally:
        db.close()


def _user_from_device_token(token: str | None) -> tuple[str | None, str | None]:
    if not token:
        return None, None
    db = SessionLocal()
    try:
        device = db.scalar(select(Device).where(Device.token_hash == hash_token(token)))
        if not device or device.revoked:
            return None, None
        device.last_seen = utcnow()
        db.commit()
        return device.user_id, device.id
    finally:
        db.close()


@router.websocket("/ws/app")
async def ws_app(websocket: WebSocket):
    user_id = _user_from_session_cookie(websocket.cookies.get(SESSION_COOKIE))
    if not user_id:
        await websocket.close(code=4401)
        return
    await manager.connect(user_id, "web", websocket)
    try:
        await websocket.send_json({"type": "hello", "role": "web"})
        while True:
            msg = await websocket.receive_json()
            mtype = msg.get("type")
            if mtype == "ping":
                await websocket.send_json({"type": "pong"})
            elif mtype in ("screencast.input", "screencast.start", "screencast.stop", "resume"):
                # Relay remote-control input to the extension executor.
                await publish(user_id, {**msg, "target": "ext"})
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await manager.disconnect(user_id, "web", websocket)


@router.websocket("/ws/ext")
async def ws_ext(websocket: WebSocket, token: str = Query("")):
    user_id, device_id = _user_from_device_token(token)
    if not user_id:
        await websocket.close(code=4401)
        return
    await manager.connect(user_id, "ext", websocket)
    try:
        await websocket.send_json({"type": "hello", "role": "ext", "device_id": device_id})
        # Tell the web UI the extension is online.
        await publish(user_id, {"type": "ext.status", "target": "web", "online": True})
        while True:
            msg = await websocket.receive_json()
            mtype = msg.get("type")
            if mtype == "ping":
                await websocket.send_json({"type": "pong"})
            elif mtype in ("screencast.frame", "intervention.new", "application.update", "run.progress"):
                # Relay extension events (e.g. a live tab's frames) to the web UI.
                await publish(user_id, {**msg, "target": "web"})
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await manager.disconnect(user_id, "ext", websocket)
        await publish(user_id, {"type": "ext.status", "target": "web", "online": False})
