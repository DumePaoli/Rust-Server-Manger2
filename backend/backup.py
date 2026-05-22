import asyncio
import json
import os
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

_CFG_DIR = Path(os.environ.get("RSM_CONFIG_DIR", Path.home() / "AppData/Roaming/RustServerManager"))
_CFG_FILE = _CFG_DIR / "backup_config.json"

DEFAULT_CONFIG: dict = {
    "enabled": False,
    "backup_dir": str(Path.home() / "RustServerBackups"),
    "keep_last": 10,
    "interval_hours": 6,
    "last_backup": None,
}

_progress: dict = {"running": False, "percent": 0, "error": None, "current_file": ""}


# ── Config helpers ─────────────────────────────────────────────────────────

def load_backup_config() -> dict:
    try:
        return {**DEFAULT_CONFIG, **json.loads(_CFG_FILE.read_text())}
    except Exception:
        return dict(DEFAULT_CONFIG)


def save_backup_config(data: dict) -> None:
    _CFG_DIR.mkdir(parents=True, exist_ok=True)
    _CFG_FILE.write_text(json.dumps(data, indent=2))


# ── File listing ───────────────────────────────────────────────────────────

def list_backups(backup_dir: str) -> list:
    d = Path(backup_dir)
    if not d.is_dir():
        return []
    files = sorted(d.glob("backup_*.zip"), key=lambda f: f.stat().st_mtime, reverse=True)
    return [
        {
            "filename": f.name,
            "size_mb": round(f.stat().st_size / (1024 * 1024), 2),
            "created_at": datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc).isoformat(),
        }
        for f in files
    ]


def delete_backup(backup_dir: str, filename: str) -> tuple[bool, str]:
    p = Path(backup_dir) / filename
    if not p.exists() or not filename.startswith("backup_"):
        return False, "Fichier introuvable"
    try:
        p.unlink()
        return True, "Supprimé"
    except Exception as exc:
        return False, str(exc)


# ── Core backup logic ──────────────────────────────────────────────────────

def _collect_files(data_path: str) -> list[Path]:
    root = Path(data_path)
    collected: list[Path] = []
    # .sav and .map anywhere under data_path
    for ext in ("*.sav", "*.map"):
        collected.extend(root.rglob(ext))
    # oxide + carbon config/data dirs
    for subdir in ("oxide/data", "oxide/config", "carbon/data", "carbon/configs"):
        d = root / subdir
        if d.is_dir():
            collected.extend(f for f in d.rglob("*") if f.is_file())
    return [f for f in collected if f.is_file()]


def do_backup(data_path: str, backup_dir: str, keep_last: int) -> tuple[bool, str]:
    global _progress
    _progress = {"running": True, "percent": 0, "error": None, "current_file": ""}

    Path(backup_dir).mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    dest = Path(backup_dir) / f"backup_{ts}.zip"

    files = _collect_files(data_path)
    if not files:
        _progress.update({"running": False, "error": "Aucun fichier à sauvegarder"})
        return False, "Aucun fichier .sav/.map trouvé dans le dossier data"

    root = Path(data_path)
    try:
        with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
            for i, f in enumerate(files):
                arcname = f.relative_to(root)
                zf.write(f, arcname)
                _progress["percent"] = int((i + 1) / len(files) * 100)
                _progress["current_file"] = str(arcname)

        _rotate(backup_dir, keep_last)
        _progress.update({"running": False, "percent": 100})
        return True, f"Sauvegarde créée : {dest.name}"
    except Exception as exc:
        _progress.update({"running": False, "error": str(exc)})
        if dest.exists():
            dest.unlink()
        return False, str(exc)


def _rotate(backup_dir: str, keep: int) -> None:
    files = sorted(Path(backup_dir).glob("backup_*.zip"), key=lambda f: f.stat().st_mtime)
    for f in files[:-keep] if len(files) > keep else []:
        try:
            f.unlink()
        except Exception:
            pass


def get_progress() -> dict:
    return dict(_progress)


# ── Scheduler ──────────────────────────────────────────────────────────────

class BackupScheduler:
    def __init__(self):
        self._task: Optional[asyncio.Task] = None

    def start(self) -> None:
        self._task = asyncio.create_task(self._loop())

    def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()

    async def _loop(self) -> None:
        while True:
            await asyncio.sleep(60)
            try:
                await self._tick()
            except Exception:
                pass

    async def _tick(self) -> None:
        cfg = load_backup_config()
        if not cfg.get("enabled"):
            return
        last = cfg.get("last_backup") or 0
        if time.time() - last < cfg.get("interval_hours", 6) * 3600:
            return

        from config import load_config
        data_path = load_config().get("server_data_path", "").strip()
        if not data_path:
            return

        loop = asyncio.get_event_loop()
        ok, _ = await loop.run_in_executor(
            None, do_backup, data_path, cfg["backup_dir"], cfg["keep_last"]
        )
        if ok:
            cfg["last_backup"] = time.time()
            save_backup_config(cfg)


backup_scheduler = BackupScheduler()
