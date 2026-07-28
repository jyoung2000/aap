"""In-process registry of connected WebSockets, keyed by user and kind."""
from __future__ import annotations

import asyncio
from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        # user_id -> kind ("web"|"ext") -> set[WebSocket]
        self._conns: dict[str, dict[str, set[WebSocket]]] = defaultdict(lambda: defaultdict(set))
        self._lock = asyncio.Lock()

    async def connect(self, user_id: str, kind: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._conns[user_id][kind].add(ws)

    async def disconnect(self, user_id: str, kind: str, ws: WebSocket) -> None:
        async with self._lock:
            self._conns.get(user_id, {}).get(kind, set()).discard(ws)

    def is_ext_online(self, user_id: str) -> bool:
        return bool(self._conns.get(user_id, {}).get("ext"))

    async def dispatch(self, user_id: str, target: str, message: dict) -> None:
        """Send `message` to all local sockets matching the target for a user."""
        kinds = ["web", "ext"] if target == "all" else [target]
        dead: list[tuple[str, WebSocket]] = []
        for kind in kinds:
            for ws in list(self._conns.get(user_id, {}).get(kind, set())):
                try:
                    await ws.send_json(message)
                except Exception:
                    dead.append((kind, ws))
        if dead:
            async with self._lock:
                for kind, ws in dead:
                    self._conns.get(user_id, {}).get(kind, set()).discard(ws)


manager = ConnectionManager()
