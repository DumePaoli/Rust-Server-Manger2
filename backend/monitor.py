import asyncio
import time
from typing import Optional

import psutil

MAX_POINTS = 720  # 1 hour at 5-second intervals


class Monitor:
    def __init__(self):
        self._samples: list[dict] = []
        self._task: Optional[asyncio.Task] = None
        self._manager = None

    def set_manager(self, manager) -> None:
        self._manager = manager

    def start(self) -> None:
        self._task = asyncio.create_task(self._loop())

    def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()

    async def _loop(self) -> None:
        while True:
            try:
                self._collect()
            except Exception:
                pass
            await asyncio.sleep(5)

    def _collect(self) -> None:
        sample: dict = {"ts": time.time(), "cpu": 0.0, "ram_mb": 0.0, "players": 0}
        if self._manager and self._manager.is_running:
            try:
                proc = psutil.Process(self._manager._process.pid)
                sample["cpu"] = round(proc.cpu_percent(interval=None), 1)
                sample["ram_mb"] = round(proc.memory_info().rss / (1024 * 1024), 1)
            except Exception:
                pass
            try:
                sample["players"] = len(self._manager.players.get_players())
            except Exception:
                pass
        self._samples.append(sample)
        if len(self._samples) > MAX_POINTS:
            self._samples = self._samples[-MAX_POINTS:]

    def get_metrics(self, minutes: int = 15) -> dict:
        cutoff = time.time() - minutes * 60
        recent = [s for s in self._samples if s["ts"] >= cutoff]
        return {
            "cpu_series":     [s["cpu"]     for s in recent],
            "ram_series":     [s["ram_mb"]  for s in recent],
            "players_series": [s["players"] for s in recent],
            "timestamps":     [s["ts"]      for s in recent],
        }


monitor = Monitor()
