import json
import os
from typing import Optional


def _oxide_data_dir(config: dict) -> Optional[str]:
    data_path = config.get("server_data_path", "").strip()
    if not data_path:
        return None
    for sub in ("oxide/data", "Oxide/data"):
        p = os.path.join(data_path, sub)
        if os.path.isdir(p):
            return p
    return None


def _read(path: str) -> Optional[dict]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def get_groups(config: dict) -> dict:
    d = _oxide_data_dir(config)
    if not d:
        return {"groups": {}, "error": "Oxide non trouvé — vérifiez server_data_path"}
    data = _read(os.path.join(d, "oxide.groups.data"))
    if data is None:
        return {"groups": {}, "error": "oxide.groups.data introuvable — démarrez le serveur avec Oxide une fois"}
    return {
        "groups": {
            name: {
                "title": info.get("Title", name),
                "rank": info.get("Rank", 0),
                "perms": sorted(info.get("Perms", [])),
            }
            for name, info in data.items()
        },
        "error": None,
    }


def get_users(config: dict) -> dict:
    d = _oxide_data_dir(config)
    if not d:
        return {"users": {}, "error": "Oxide non trouvé"}
    data = _read(os.path.join(d, "oxide.users.data"))
    if data is None:
        return {"users": {}, "error": "oxide.users.data introuvable"}
    return {
        "users": {
            sid: {
                "name": info.get("LastSeenNickname", sid),
                "groups": sorted(info.get("Groups", [])),
                "perms": sorted(info.get("Perms", [])),
            }
            for sid, info in data.items()
        },
        "error": None,
    }
