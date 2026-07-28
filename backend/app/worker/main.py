"""arq worker entrypoint.  Run with:  arq app.worker.main.WorkerSettings"""
from __future__ import annotations

import logging

from ..queue import redis_settings
from .tasks import run_search_task, run_server_apply_task

logging.basicConfig(level=logging.INFO)


async def startup(ctx):
    logging.getLogger("jobpilot.worker").info("Worker started")


async def shutdown(ctx):
    pass


class WorkerSettings:
    functions = [run_search_task, run_server_apply_task]
    redis_settings = redis_settings()
    on_startup = startup
    on_shutdown = shutdown
    max_tries = 4          # retries with exponential backoff on failure
    job_timeout = 900
    keep_result = 3600
    max_jobs = 10
