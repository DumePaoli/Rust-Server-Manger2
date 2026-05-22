import re
import time

_CHAT_RE = re.compile(
    r'(?:\[CHAT\]|\[Chat\])\s*(?:(.+?)\s*\[(\d{17,18})\]\s*)?:?\s*(.+)',
    re.IGNORECASE,
)
# Fallback: "Name [SteamID] : message"
_CHAT_RE2 = re.compile(r'^(.+?)\s+\[(\d{17,18})\]\s*:\s*(.+)$')
_TS_RE = re.compile(r'^\[\d{2}:\d{2}:\d{2}\]\s*')

MAX = 500


class ChatLog:
    def __init__(self):
        self._lines: list[dict] = []

    def on_log_line(self, raw: str) -> None:
        line = _TS_RE.sub("", raw)

        m = _CHAT_RE.search(line)
        if m:
            name    = (m.group(1) or "").strip()
            steamid = (m.group(2) or "").strip()
            message = (m.group(3) or "").strip()
            if message:
                self._append(name or "?", steamid, message)
            return

        m2 = _CHAT_RE2.match(line)
        if m2:
            self._append(m2.group(1).strip(), m2.group(2).strip(), m2.group(3).strip())

    def _append(self, name: str, steamid: str, message: str) -> None:
        self._lines.append({"ts": time.time(), "name": name, "steamid": steamid, "message": message})
        if len(self._lines) > MAX:
            self._lines = self._lines[-MAX:]

    def get_lines(self, search: str = "", limit: int = 200) -> list:
        src = self._lines
        if search:
            s = search.lower()
            src = [l for l in src if s in l["name"].lower() or s in l["message"].lower()]
        return list(reversed(src[-limit:]))

    def clear(self) -> None:
        self._lines.clear()


chat_log = ChatLog()
