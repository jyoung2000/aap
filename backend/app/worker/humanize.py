"""Humanized-input timing for the Playwright executor (mirrors the extension's
character-by-character behavior)."""
from __future__ import annotations

import random
import time


def human_delay(lo: float = 0.06, hi: float = 0.18) -> None:
    time.sleep(random.uniform(lo, hi))


def reading_pause() -> None:
    time.sleep(random.uniform(2.0, 8.0))


def think_between_jobs() -> None:
    time.sleep(random.uniform(3.0, 12.0))
