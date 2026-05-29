import asyncio
import json
import time
import uuid
from pathlib import Path
import os
from typing import Optional


def _messages_path() -> Path:
    env_dir = os.environ.get("RSM_CONFIG_DIR")
    if env_dir:
        d = Path(env_dir)
        d.mkdir(parents=True, exist_ok=True)
        return d / "scheduled_messages.json"
    return Path(__file__).parent / "scheduled_messages.json"


MESSAGES_PATH = _messages_path()


def load_messages() -> list:
    if MESSAGES_PATH.exists():
        with open(MESSAGES_PATH, "r") as f:
            return json.load(f)
    return []


def save_messages(messages: list) -> None:
    with open(MESSAGES_PATH, "w") as f:
        json.dump(messages, f, indent=2)


class MessageScheduler:
    def __init__(self):
        self._task: Optional[asyncio.Task] = None
        self._last_sent: dict[str, float] = {}
        self._send_fn = None

    def set_send_fn(self, fn):
        self._send_fn = fn

    def start(self):
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._loop())

    def stop(self):
        if self._task and not self._task.done():
            self._task.cancel()
            self._task = None

    async def _loop(self):
        while True:
            await asyncio.sleep(10)
            if self._send_fn is None:
                continue
            messages = load_messages()
            now = time.time()
            for msg in messages:
                if not msg.get("enabled", True):
                    continue
                mid = msg.get("id", "")
                interval_sec = msg.get("interval_minutes", 5) * 60
                last = self._last_sent.get(mid, 0)
                if now - last >= interval_sec:
                    self._last_sent[mid] = now
                    text = msg.get("text", "").strip()
                    if text:
                        try:
                            safe = text.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ").replace("\r", " ")
                            await self._send_fn(f'say "{safe}"')
                        except Exception:
                            pass
