"""Redis pub/sub bus bridging the worker, the app, and connected browsers.

Every real-time event is published to `bus:{user_id}` as JSON with a `target`
field ("web" | "ext" | "all"). The app process runs a single psubscribe loop
that fans each event out to the right locally-connected WebSockets.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

import redis.asyncio as aioredis

from .config import settings

_pub: aioredis.Redis | None = None


def _channel(user_id: str) -> str:
    return f"bus:{user_id}"


async def get_redis() -> aioredis.Redis:
    global _pub
    if _pub is None:
        _pub = aioredis.from_url(settings.redis_dsn, encoding="utf-8", decode_responses=True)
    return _pub


async def publish(user_id: str, message: dict[str, Any]) -> None:
    """Publish an event for a user. `target` defaults to 'web'. Best-effort."""
    message.setdefault("target", "web")
    try:
        r = await get_redis()
        await r.publish(_channel(user_id), json.dumps(message))
    except Exception:
        pass  # real-time is best-effort; never break a request when Redis is down


def publish_sync(user_id: str, message: dict[str, Any]) -> None:
    """Synchronous publish for the arq worker context (own event loop)."""
    message.setdefault("target", "web")
    r = aioredis.from_url(settings.redis_dsn, encoding="utf-8", decode_responses=True)

    async def _do():
        try:
            await r.publish(_channel(user_id), json.dumps(message))
        except Exception:
            pass
        finally:
            try:
                await r.aclose()
            except Exception:
                pass

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    try:
        if loop and loop.is_running():
            loop.create_task(_do())
        else:
            asyncio.run(_do())
    except Exception:
        pass


async def run_subscriber(manager) -> None:
    """Background task: dispatch bus events to local sockets. Runs for app lifetime."""
    r = aioredis.from_url(settings.redis_dsn, encoding="utf-8", decode_responses=True)
    pubsub = r.pubsub()
    await pubsub.psubscribe("bus:*")
    try:
        async for raw in pubsub.listen():
            if raw is None or raw.get("type") != "pmessage":
                continue
            channel = raw["channel"]
            user_id = channel.split(":", 1)[1]
            try:
                message = json.loads(raw["data"])
            except (ValueError, TypeError):
                continue
            target = message.get("target", "web")
            await manager.dispatch(user_id, target, message)
    except asyncio.CancelledError:
        pass
    finally:
        await pubsub.aclose()
        await r.aclose()
