"""Out-of-band notifications when a run pauses for human input.

Supports an ntfy/Telegram-compatible webhook (per-user or global) and optional
SMTP email. Best-effort — failures never break a run."""
from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

import httpx

from ..config import settings

log = logging.getLogger("jobpilot.notify")


def send_pause_notification(user, message: str, *, app_id: str = "", job: str = "") -> None:
    webhook = (getattr(user, "notify_webhook_url", "") or settings.notify_webhook_url or "").strip()
    body = f"{message}\nJob: {job}\nOpen JobPilot → Apply Queue to answer."
    if webhook:
        _post_webhook(webhook, body)
    if settings.smtp_host and settings.smtp_from and getattr(user, "email", ""):
        _send_email(user.email, "JobPilot needs your input", body)


def _post_webhook(url: str, body: str) -> None:
    try:
        with httpx.Client(timeout=10) as c:
            # ntfy accepts a plain-text POST; Telegram-style webhooks accept JSON too.
            c.post(url, content=body.encode("utf-8"), headers={"Title": "JobPilot", "Priority": "high"})
    except Exception as exc:
        log.info("webhook notify failed: %s", exc)


def _send_email(to_addr: str, subject: str, body: str) -> None:
    try:
        msg = EmailMessage()
        msg["From"] = settings.smtp_from
        msg["To"] = to_addr
        msg["Subject"] = subject
        msg.set_content(body)
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as s:
            s.starttls()
            if settings.smtp_user:
                s.login(settings.smtp_user, settings.smtp_password)
            s.send_message(msg)
    except Exception as exc:
        log.info("email notify failed: %s", exc)
