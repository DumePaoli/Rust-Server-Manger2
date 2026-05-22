import re
from pathlib import Path
from typing import Optional


_LINE_RE = re.compile(r'^add\s+(\d{17,18})\s+"([^"]*)"', re.IGNORECASE)


def _find_users_cfg(config: dict) -> Optional[Path]:
    data_path = config.get("server_data_path", "").strip()
    identity  = config.get("server_identity", "rust_server")
    if not data_path:
        return None
    for candidate in [
        Path(data_path) / identity / "cfg" / "users.cfg",
        Path(data_path) / "cfg" / "users.cfg",
    ]:
        if candidate.exists():
            return candidate
    return Path(data_path) / identity / "cfg" / "users.cfg"


def list_whitelist(config: dict) -> dict:
    path = _find_users_cfg(config)
    entries = []
    error = None
    if path is None:
        error = "server_data_path non configuré"
    elif not path.exists():
        error = None
    else:
        try:
            for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
                m = _LINE_RE.match(line.strip())
                if m:
                    entries.append({"steamid": m.group(1), "name": m.group(2)})
        except Exception as e:
            error = str(e)
    return {"entries": entries, "file": str(path) if path else None, "error": error}


def add_entry(config: dict, steamid: str, name: str) -> tuple[bool, str]:
    path = _find_users_cfg(config)
    if path is None:
        return False, "server_data_path non configuré"
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = list_whitelist(config)
    if any(e["steamid"] == steamid for e in existing["entries"]):
        return False, f"{steamid} est déjà dans la whitelist"
    try:
        with open(path, "a", encoding="utf-8") as f:
            f.write(f'\nadd {steamid} "{name}" "" "" "" 0\n')
        return True, f"{steamid} ajouté à la whitelist"
    except Exception as e:
        return False, str(e)


def remove_entry(config: dict, steamid: str) -> tuple[bool, str]:
    path = _find_users_cfg(config)
    if path is None:
        return False, "server_data_path non configuré"
    if not path.exists():
        return False, "Fichier whitelist introuvable"
    try:
        lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
        new_lines = [l for l in lines if not l.strip().startswith(f"add {steamid}")]
        path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
        return True, f"{steamid} retiré de la whitelist"
    except Exception as e:
        return False, str(e)
