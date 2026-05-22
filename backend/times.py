import asyncio
import json
import os
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, Callable

CONFIG_DIR = os.environ.get("RSM_CONFIG_DIR", os.path.dirname(os.path.abspath(__file__)))
TIMES_FILE = os.path.join(CONFIG_DIR, "times.json")

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
WEEKDAY_FR = {
    "monday": "Lundi", "tuesday": "Mardi", "wednesday": "Mercredi",
    "thursday": "Jeudi", "friday": "Vendredi", "saturday": "Samedi", "sunday": "Dimanche",
}


def load_tasks() -> list:
    try:
        with open(TIMES_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def save_tasks(tasks: list) -> None:
    Path(TIMES_FILE).parent.mkdir(parents=True, exist_ok=True)
    with open(TIMES_FILE, "w", encoding="utf-8") as f:
        json.dump(tasks, f, indent=2, ensure_ascii=False)


def compute_next_run(task: dict) -> Optional[str]:
    """Return ISO UTC datetime of the task's next execution."""
    now = datetime.now(timezone.utc)
    stype = task.get("schedule_type", "daily")
    time_str = task.get("time", "04:00")

    try:
        h, m = map(int, time_str.split(":"))
    except Exception:
        h, m = 4, 0

    if stype == "daily":
        candidate = now.replace(hour=h, minute=m, second=0, microsecond=0)
        if candidate <= now:
            candidate += timedelta(days=1)
        return candidate.isoformat()

    elif stype == "weekly":
        day_name = task.get("day", "monday")
        target_wd = WEEKDAYS.index(day_name) if day_name in WEEKDAYS else 0
        days_ahead = (target_wd - now.weekday()) % 7
        candidate = (now + timedelta(days=days_ahead)).replace(hour=h, minute=m, second=0, microsecond=0)
        if candidate <= now:
            candidate += timedelta(weeks=1)
        return candidate.isoformat()

    elif stype == "interval":
        hours = max(1, int(task.get("interval_hours", 6)))
        last = task.get("last_run")
        if last:
            try:
                last_dt = datetime.fromisoformat(last)
                candidate = last_dt + timedelta(hours=hours)
                if candidate <= now:
                    candidate = now + timedelta(hours=hours)
                return candidate.isoformat()
            except Exception:
                pass
        return (now + timedelta(hours=hours)).isoformat()

    return None


def task_schedule_label(task: dict) -> str:
    stype = task.get("schedule_type", "daily")
    time_str = task.get("time", "04:00")
    if stype == "daily":
        return f"Tous les jours à {time_str}"
    elif stype == "weekly":
        day = WEEKDAY_FR.get(task.get("day", "monday"), "Lundi")
        return f"Chaque {day} à {time_str}"
    elif stype == "interval":
        h = task.get("interval_hours", 6)
        return f"Toutes les {h}h"
    return "—"


class TimeScheduler:
    def __init__(self):
        self._send_fn: Optional[Callable] = None
        self._stop_fn: Optional[Callable] = None
        self._start_fn: Optional[Callable] = None
        self._asyncio_task = None
        self._warned: dict[str, set] = {}

    def set_callbacks(self, send_fn, stop_fn, start_fn):
        self._send_fn = send_fn
        self._stop_fn = stop_fn
        self._start_fn = start_fn

    def start(self):
        self._asyncio_task = asyncio.create_task(self._loop())

    def stop(self):
        if self._asyncio_task:
            self._asyncio_task.cancel()

    async def _loop(self):
        while True:
            await asyncio.sleep(30)
            try:
                await self._tick()
            except Exception:
                pass

    async def _tick(self):
        tasks = load_tasks()
        now = datetime.now(timezone.utc)
        changed = False

        for task in tasks:
            if not task.get("enabled"):
                continue

            # Ensure next_run is set
            if not task.get("next_run"):
                task["next_run"] = compute_next_run(task)
                changed = True
                continue

            try:
                next_run = datetime.fromisoformat(task["next_run"])
            except Exception:
                task["next_run"] = compute_next_run(task)
                changed = True
                continue

            secs = (next_run - now).total_seconds()
            tid = task["id"]

            # Countdown warnings (restart tasks only)
            if task.get("type") == "restart" and secs > 0:
                warn_list = task.get("warn_minutes", [15, 5, 1])
                if tid not in self._warned:
                    self._warned[tid] = set()
                for w in warn_list:
                    if secs <= w * 60 and w not in self._warned[tid]:
                        self._warned[tid].add(w)
                        if self._send_fn:
                            asyncio.create_task(
                                self._send_fn(f"say [Auto] Redémarrage dans {w} minute(s) !")
                            )

            # Execute
            if secs <= 30:
                self._warned.pop(tid, None)
                task["last_run"] = now.isoformat()
                task["next_run"] = compute_next_run(task)
                changed = True

                task_type = task.get("type", "command")
                if task_type == "restart":
                    asyncio.create_task(self._do_restart())
                elif task_type == "command":
                    cmd = task.get("command", "").strip()
                    if cmd and self._send_fn:
                        asyncio.create_task(self._send_fn(cmd))

        if changed:
            save_tasks(tasks)

    async def _do_restart(self):
        from config import load_config
        if self._send_fn:
            await self._send_fn("say [Auto] Redémarrage du serveur...")
        await asyncio.sleep(3)
        if self._stop_fn:
            await self._stop_fn()
        await asyncio.sleep(5)
        if self._start_fn:
            await self._start_fn(load_config())
