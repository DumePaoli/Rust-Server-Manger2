import re
import time
import random
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

_DEMO_PLAYERS = [
    {"steamid": "76561198000000001", "name": "xXRustKingXx", "ping": 42, "ip": "192.168.1.10"},
    {"steamid": "76561198000000002", "name": "NightWalker99", "ping": 78, "ip": "10.0.0.2"},
    {"steamid": "76561198000000003", "name": "SurvivalPro", "ping": 31, "ip": "172.16.0.5"},
    {"steamid": "76561198000000004", "name": "fr3nch_toast", "ping": 112, "ip": "192.168.0.55"},
    {"steamid": "76561198000000005", "name": "BuildMaster2000", "ping": 65, "ip": "10.10.1.1"},
]


class PlayerManager:
    def __init__(self):
        # steamid -> player dict
        self._players: dict[str, dict] = {}

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
                return

        for pat in _DISCONNECT_PATTERNS:
            m = pat.search(line)
            if m:
                groups = m.groups()
                steamid = next((g for g in groups if g and len(g) == 17 and g.isdigit()), None)
                if steamid and steamid in self._players:
                    del self._players[steamid]
                return

    def set_demo_players(self) -> None:
        self._players.clear()
        for p in _DEMO_PLAYERS:
            self._players[p["steamid"]] = {
                **p,
                "connected_at": time.time() - random.randint(60, 7200),
            }

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
