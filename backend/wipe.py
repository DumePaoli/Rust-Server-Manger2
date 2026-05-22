import asyncio
import glob
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


def _wipe_data_path() -> Path:
    env_dir = os.environ.get("RSM_CONFIG_DIR")
    if env_dir:
        d = Path(env_dir)
        d.mkdir(parents=True, exist_ok=True)
        return d / "wipe_data.json"
    return Path(__file__).parent / "wipe_data.json"


WIPE_DATA_PATH = _wipe_data_path()

DEFAULT_WIPE_DATA = {
    "next_wipe": None,        # ISO datetime string (UTC)
    "wipe_type": "map",       # "map" | "full"
    "recurrence": "none",     # "none" | "weekly" | "biweekly" | "monthly"
    "warnings": [30, 10, 5, 1],  # minutes before wipe to warn
    "history": [],
}


def load_wipe_data() -> dict:
    if WIPE_DATA_PATH.exists():
        with open(WIPE_DATA_PATH) as f:
            data = json.load(f)
        return {**DEFAULT_WIPE_DATA, **data}
    return DEFAULT_WIPE_DATA.copy()


def save_wipe_data(data: dict) -> None:
    with open(WIPE_DATA_PATH, "w") as f:
        json.dump(data, f, indent=2)


def seconds_until_wipe(next_wipe_iso: Optional[str]) -> Optional[int]:
    if not next_wipe_iso:
        return None
    try:
        dt = datetime.fromisoformat(next_wipe_iso)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        diff = dt - datetime.now(timezone.utc)
        return max(0, int(diff.total_seconds()))
    except Exception:
        return None


def _next_recurrence(dt: datetime, recurrence: str) -> Optional[datetime]:
    from datetime import timedelta
    if recurrence == "weekly":
        return dt + timedelta(weeks=1)
    if recurrence == "biweekly":
        return dt + timedelta(weeks=2)
    if recurrence == "monthly":
        # Same day next month
        month = dt.month % 12 + 1
        year = dt.year + (1 if dt.month == 12 else 0)
        try:
            return dt.replace(year=year, month=month)
        except ValueError:
            # Month doesn't have that day (e.g. Feb 30)
            import calendar
            last_day = calendar.monthrange(year, month)[1]
            return dt.replace(year=year, month=month, day=last_day)
    return None


def _delete_server_files(data_path: str, wipe_type: str) -> tuple[int, list[str]]:
    """Delete server data files. Returns (count_deleted, errors)."""
    p = Path(data_path)
    if not p.exists():
        return 0, [f"Dossier introuvable : {data_path}"]

    patterns = ["*.sav", "*.sav.gz"]
    if wipe_type == "full":
        patterns += ["player.blueprints.*.db"]

    deleted = 0
    errors = []
    for pattern in patterns:
        for f in p.glob(pattern):
            try:
                f.unlink()
                deleted += 1
            except Exception as e:
                errors.append(str(e))
    return deleted, errors


class WipeScheduler:
    def __init__(self):
        self._task: Optional[asyncio.Task] = None
        self._warned: set[str] = set()  # "wipe_iso:minutes" already warned
        self._send_fn = None
        self._stop_fn = None
        self._start_fn = None

    def set_callbacks(self, send_fn, stop_fn, start_fn):
        self._send_fn = send_fn
        self._stop_fn = stop_fn
        self._start_fn = start_fn

    def start(self):
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._loop())

    def stop(self):
        if self._task and not self._task.done():
            self._task.cancel()

    async def _loop(self):
        while True:
            await asyncio.sleep(15)
            await self._tick()

    async def _tick(self):
        data = load_wipe_data()
        nw = data.get("next_wipe")
        if not nw:
            return

        secs = seconds_until_wipe(nw)
        if secs is None:
            return

        # Send warnings
        for warn_min in data.get("warnings", []):
            warn_secs = warn_min * 60
            key = f"{nw}:{warn_min}"
            if key not in self._warned and 0 < secs <= warn_secs:
                self._warned.add(key)
                if self._send_fn:
                    label = f"{warn_min} minute{'s' if warn_min > 1 else ''}"
                    await self._send_fn(f"say [WIPE] Le serveur sera wipé dans {label} !")

        # Execute wipe
        if secs == 0:
            await self._execute_wipe(data)

    async def _execute_wipe(self, data: dict):
        from config import load_config
        config = load_config()

        if self._send_fn:
            await self._send_fn("say [WIPE] Wipe en cours — le serveur redémarre...")

        await asyncio.sleep(3)

        if self._stop_fn:
            await self._stop_fn()

        await asyncio.sleep(3)

        # Delete files
        data_path = config.get("server_data_path", "")
        if data_path:
            deleted, errors = _delete_server_files(data_path, data.get("wipe_type", "map"))
        else:
            deleted, errors = 0, ["server_data_path non configuré"]

        # Record in history
        history = data.get("history", [])
        history.insert(0, {
            "date": datetime.now(timezone.utc).isoformat(),
            "type": data.get("wipe_type", "map"),
            "files_deleted": deleted,
            "errors": errors,
        })
        data["history"] = history[:50]  # keep last 50

        # Schedule next recurrence
        next_dt = None
        recurrence = data.get("recurrence", "none")
        if recurrence != "none":
            try:
                dt = datetime.fromisoformat(data["next_wipe"])
                next_dt = _next_recurrence(dt, recurrence)
            except Exception:
                pass
        data["next_wipe"] = next_dt.isoformat() if next_dt else None
        self._warned.clear()
        save_wipe_data(data)

        # Restart server
        await asyncio.sleep(2)
        if self._start_fn:
            await self._start_fn(config)
