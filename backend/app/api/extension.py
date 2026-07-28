"""Extension pairing, device management, and bundle downloads."""
from __future__ import annotations

import secrets
from datetime import timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..core.deps import get_current_user
from ..core.scoping import get_owned
from ..core.security import generate_token, hash_token
from ..db import as_aware, get_db, utcnow
from ..models import Device, PairingCode, User

router = APIRouter(prefix="/api/extension", tags=["extension"])

BUNDLE_DIR = Path(__file__).resolve().parents[1] / "static" / "extension"
PAIR_TTL_MINUTES = 10


class PairingOut(BaseModel):
    code: str
    expires_at: str
    pair_url: str
    base_url: str


class PairRequest(BaseModel):
    code: str
    name: str = "Browser"
    browser: str = ""
    capabilities: str = ""


class PairResponse(BaseModel):
    device_token: str
    user_email: str
    ws_url: str
    api_base: str


class DeviceOut(BaseModel):
    id: str
    name: str
    browser: str
    revoked: bool
    last_seen: str | None
    capabilities: str
    model_config = {"from_attributes": True}


@router.post("/pairing-code", response_model=PairingOut)
def create_pairing_code(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    code = f"{secrets.randbelow(1_000_000):06d}"
    expires = utcnow() + timedelta(minutes=PAIR_TTL_MINUTES)
    db.add(PairingCode(user_id=user.id, code=code, expires_at=expires))
    db.commit()
    base = settings.public_base_url.rstrip("/")
    return PairingOut(
        code=code, expires_at=expires.isoformat(),
        pair_url=f"{base}/pair?code={code}", base_url=base,
    )


@router.post("/pair", response_model=PairResponse)
def pair_device(payload: PairRequest, db: Session = Depends(get_db)):
    """Public endpoint: exchange a valid pairing code for a device token."""
    pc = db.scalar(
        select(PairingCode).where(PairingCode.code == payload.code, PairingCode.used.is_(False))
        .order_by(PairingCode.created_at.desc())
    )
    if not pc or as_aware(pc.expires_at) <= utcnow():
        raise HTTPException(status_code=400, detail="Invalid or expired code")
    pc.used = True
    token = generate_token()
    device = Device(
        user_id=pc.user_id, name=payload.name[:255], browser=payload.browser[:64],
        token_hash=hash_token(token), capabilities=payload.capabilities[:255],
        last_seen=utcnow(),
    )
    db.add(device)
    db.commit()
    user = db.get(User, pc.user_id)
    base = settings.public_base_url.rstrip("/")
    ws_base = base.replace("http://", "ws://").replace("https://", "wss://")
    return PairResponse(
        device_token=token, user_email=user.email if user else "",
        ws_url=f"{ws_base}/ws/ext", api_base=base,
    )


@router.get("/devices", response_model=list[DeviceOut])
def list_devices(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Device).where(Device.user_id == user.id).order_by(Device.created_at.desc())).all()
    return [
        DeviceOut(
            id=d.id, name=d.name, browser=d.browser, revoked=d.revoked,
            last_seen=d.last_seen.isoformat() if d.last_seen else None, capabilities=d.capabilities,
        )
        for d in rows
    ]


@router.delete("/devices/{device_id}", status_code=204)
def revoke_device(device_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    device = get_owned(db, Device, device_id, user.id)
    device.revoked = True
    db.commit()
    return Response(status_code=204)


@router.get("/info")
def extension_info(user: User = Depends(get_current_user)):
    base = settings.public_base_url.rstrip("/")
    ws_base = base.replace("http://", "ws://").replace("https://", "wss://")
    return {
        "version": settings.extension_version,
        "chrome_download": f"{base}/api/extension/download/chrome",
        "firefox_download": f"{base}/api/extension/download/firefox",
        "chrome_available": (BUNDLE_DIR / "jobpilot-chrome.zip").exists(),
        "firefox_available": (BUNDLE_DIR / "jobpilot-firefox.xpi").exists(),
        "ws_url": f"{ws_base}/ws/ext",
        "api_base": base,
    }


@router.get("/download/{browser}")
def download_bundle(browser: str):
    filename = {"chrome": "jobpilot-chrome.zip", "firefox": "jobpilot-firefox.xpi"}.get(browser)
    if not filename:
        raise HTTPException(status_code=404, detail="Unknown browser")
    path = BUNDLE_DIR / filename
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail="Extension bundle not built. Run `docker compose build` or `pnpm build` in extension/.",
        )
    media = "application/zip" if browser == "chrome" else "application/x-xpinstall"
    return FileResponse(path, media_type=media, filename=filename)
