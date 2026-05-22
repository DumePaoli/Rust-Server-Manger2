import re
import time
from typing import Optional

# Patterns to detect player connects/disconnects in Rust server logs
_CONNECT_PATTERNS = [
    re.compile(r"(\d{17})[^/]*/(.+?) joined"),
    re.compile(r"PlayerConnected[:\s]+(.+?)\s+[\[\(](\d{17})[\]\)]"),
    re.compile(r"\[JOIN\]\s+(.+?)\s+\((\d{17})\)"),
]
_DISCONNECT_PATTERNS = [
    re.compile(r"(\d{17})[^/]*/(.+?) disconnecting"),
    re.compile(r"PlayerDisconnected[:\s]+(.+?)\s+[\[\(](\d{17})[\]\)]"),
    re.compile(r"\[LEAVE\]\s+(.+?)\s+\((\d{17})\)"),
]

class PlayerManager:
    def __init__(self):
        self._players: dict[str, dict] = {}
        self._on_connect = None
        self._on_disconnect = None

    def set_connect_cb(self, cb) -> None:
        self._on_connect = cb

    def set_disconnect_cb(self, cb) -> None:
        self._on_disconnect = cb

    def on_log_line(self, line: str) -> None:
        for pat in _CONNECT_PATTERNS:
            m = pat.search(line)
            if m:
                groups = m.groups()
                steamid = next((g for g in groups if g and len(g) == 17 and g.isdigit()), None)
                name = next((g for g in groups if g and g != steamid), "Unknown")
                if steamid:
                    self._players[steamid] = {
                        "steamid": steamid,
                        "name": name,
                        "connected_at": time.time(),
                        "ping": 0,
                    }
                    if self._on_connect:
                        try:
                            self._on_connect(name, steamid)
                        except Exception:
                            pass
                return

        for pat in _DISCONNECT_PATTERNS:
            m = pat.search(line)
            if m:
                groups = m.groups()
                steamid = next((g for g in groups if g and len(g) == 17 and g.isdigit()), None)
                if steamid and steamid in self._players:
                    player_name = self._players[steamid].get("name", steamid)
                    del self._players[steamid]
                    if self._on_disconnect:
                        try:
                            self._on_disconnect(player_name, steamid)
                        except Exception:
                            pass
                return

    def clear(self) -> None:
        self._players.clear()

    def get_players(self) -> list[dict]:
        now = time.time()
        result = []
        for p in self._players.values():
            result.append({
                **p,
                "playtime_seconds": int(now - p.get("connected_at", now)),
            })
        return sorted(result, key=lambda x: x.get("name", "").lower())
