import os
import re
from pathlib import Path
from typing import Optional


def _find_bans_file(config: dict) -> Optional[str]:
    data_path = config.get("server_data_path", "").strip()
    if not data_path:
        return None
    identity = config.get("server_identity", "rust_server")
    for candidate in [
        os.path.join(data_path, "cfg", "bans.cfg"),
        os.path.join(data_path, identity, "cfg", "bans.cfg"),
    ]:
        if os.path.isfile(candidate):
            return candidate
    return os.path.join(data_path, "cfg", "bans.cfg")


def list_bans(config: dict) -> dict:
    f = _find_bans_file(config)
    if not f:
        return {"bans": [], "file": None, "error": "server_data_path non configuré"}
    if not os.path.isfile(f):
        return {"bans": [], "file": f, "error": None}
    bans = []
    try:
        with open(f, "r", encoding="utf-8", errors="ignore") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("//"):
                    continue
                b = _parse_line(line)
                if b:
                    bans.append(b)
    except Exception as exc:
        return {"bans": [], "file": f, "error": str(exc)}
    return {"bans": bans, "file": f, "error": None}


def _parse_line(line: str) -> Optional[dict]:
    # Format: banid <steamid> ["<name>"] ["<reason>"]
    m = re.match(r'banid\s+(\d+)\s*(?:"([^"]*)"\s*)?(?:"([^"]*)")?', line, re.IGNORECASE)
    if m:
        return {
            "steamid": m.group(1),
            "name": (m.group(2) or "").strip(),
            "reason": (m.group(3) or "").strip(),
        }
    return None
