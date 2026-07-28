"""arq queue helpers for enqueuing background jobs from the app."""
from __future__ import annotations

import logging

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings

from .config import settings

_pool: ArqRedis | None = None


def redis_settings() -> RedisSettings:
    return RedisSettings(
        host=settings.redis_host, port=settings.redis_port,
        conn_retries=2, conn_retry_delay=1,
    )


async def get_queue() -> ArqRedis:
    global _pool
    if _pool is None:
        _pool = await create_pool(redis_settings())
    return _pool


async def enqueue(function: str, *args, **kwargs) -> bool:
    """Best-effort enqueue. Returns False (and logs) if Redis is unreachable rather
    than failing the web request; extension jobs are still reachable via polling."""
    try:
        pool = await get_queue()
        await pool.enqueue_job(function, *args, **kwargs)
        return True
    except Exception as exc:
        logging.getLogger("jobpilot.queue").warning("enqueue %s failed: %s", function, exc)
        return False
