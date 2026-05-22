import asyncio
import json
import time
from typing import Optional


class RconClient:
    MAX_HISTORY = 200

    def __init__(self):
        self._host = ""
        self._port = 0
        self._password = ""
        self._ws = None
        self._connected = False
        self._connecting = False
        self._error: Optional[str] = None
        self._identifier = 0
        self._pending: dict[int, asyncio.Future] = {}
        self._history: list[dict] = []
        self._reader_task: Optional[asyncio.Task] = None

    # ── public interface ────────────────────────────────────────────────────

    async def connect(self, host: str, port: int, password: str) -> tuple[bool, str]:
        if self._connected:
            await self.disconnect()

        self._host = host
        self._port = port
        self._password = password
        self._connecting = True
        self._error = None

        try:
            import websockets
            uri = f"ws://{host}:{port}/{password}"
            self._ws = await asyncio.wait_for(
                websockets.connect(uri, ping_interval=20, ping_timeout=10, open_timeout=8),
                timeout=10,
            )
            self._connected = True
            self._connecting = False
            self._reader_task = asyncio.create_task(self._reader())
            return True, f"Connecté à {host}:{port}"
        except asyncio.TimeoutError:
            self._connecting = False
            self._error = "Délai de connexion dépassé"
            return False, self._error
        except Exception as exc:
            self._connecting = False
            self._error = str(exc)
            return False, self._error

    async def disconnect(self):
        self._connected = False
        self._connecting = False
        if self._reader_task and not self._reader_task.done():
            self._reader_task.cancel()
            try:
                await self._reader_task
            except asyncio.CancelledError:
                pass
        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None
        for fut in self._pending.values():
            if not fut.done():
                fut.cancel()
        self._pending.clear()

    async def send_command(self, command: str, timeout: float = 8.0) -> tuple[bool, str]:
        if not self._connected or not self._ws:
            return False, "Non connecté"

        self._identifier += 1
        ident = self._identifier

        loop = asyncio.get_event_loop()
        fut: asyncio.Future = loop.create_future()
        self._pending[ident] = fut

        payload = json.dumps({"Identifier": ident, "Message": command, "Name": "WebRcon"})
        try:
            await self._ws.send(payload)
        except Exception as exc:
            self._pending.pop(ident, None)
            self._on_disconnect(str(exc))
            return False, str(exc)

        try:
            response = await asyncio.wait_for(fut, timeout=timeout)
            self._add_history(command, response, True)
            return True, response
        except asyncio.TimeoutError:
            self._pending.pop(ident, None)
            self._add_history(command, "(pas de réponse)", False)
            return True, "(pas de réponse)"
        except asyncio.CancelledError:
            self._pending.pop(ident, None)
            return False, "Déconnecté"

    def get_status(self) -> dict:
        return {
            "connected": self._connected,
            "connecting": self._connecting,
            "host": self._host,
            "port": self._port,
            "error": self._error,
        }

    def get_history(self) -> list:
        return list(self._history)

    def clear_history(self):
        self._history.clear()

    # ── internals ───────────────────────────────────────────────────────────

    async def _reader(self):
        try:
            async for raw in self._ws:
                try:
                    data = json.loads(raw)
                except Exception:
                    continue
                ident = data.get("Identifier", -1)
                msg = data.get("Message", "")
                if ident in self._pending:
                    fut = self._pending.pop(ident)
                    if not fut.done():
                        fut.set_result(msg)
                else:
                    # Unsolicited message (chat, server log, etc.)
                    self._add_history(None, msg, True)
        except Exception as exc:
            self._on_disconnect(str(exc))

    def _on_disconnect(self, reason: str):
        self._connected = False
        self._error = reason
        for fut in self._pending.values():
            if not fut.done():
                fut.cancel()
        self._pending.clear()

    def _add_history(self, command: Optional[str], response: str, ok: bool):
        self._history.append({
            "ts": time.time(),
            "command": command,
            "response": response,
            "ok": ok,
        })
        if len(self._history) > self.MAX_HISTORY:
            self._history = self._history[-self.MAX_HISTORY:]


rcon_client = RconClient()
