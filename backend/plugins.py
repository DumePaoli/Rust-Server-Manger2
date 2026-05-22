import os
import sys
import json
import re
import urllib.request
import urllib.parse
from pathlib import Path
from typing import Optional

UMOD_API = "https://umod.org/plugins.json"


def _get_plugins_dir(config: dict) -> Optional[str]:
    data_path = config.get("server_data_path", "").strip()
    if not data_path:
        return None
    for sub in ["oxide/plugins", "Oxide/plugins", "carbon/plugins", "Carbon/plugins"]:
        p = os.path.join(data_path, sub)
        if os.path.isdir(p):
            return p
    # Directory might not exist yet — return expected path so we can show instructions
    return os.path.join(data_path, "oxide/plugins")


def _read_plugin_version(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            head = f.read(800)
        m = re.search(r'[Vv]ersion["\s:=]+(\d+\.\d+[\.\d]*)', head)
        if m:
            return m.group(1)
    except Exception:
        pass
    return ""


def list_installed(config: dict) -> dict:
    plugins_dir = _get_plugins_dir(config)
    if not plugins_dir:
        return {"plugins": [], "plugins_dir": None, "error": "server_data_path non configuré"}

    if not os.path.isdir(plugins_dir):
        return {"plugins": [], "plugins_dir": plugins_dir, "error": "Dossier oxide/plugins introuvable — démarrez le serveur une première fois avec Oxide pour le créer."}

    plugins = []
    for fname in sorted(os.listdir(plugins_dir)):
        if not (fname.endswith(".cs") or fname.endswith(".js")):
            continue
        name = fname.rsplit(".", 1)[0]
        fpath = os.path.join(plugins_dir, fname)
        plugins.append({
            "name": name,
            "filename": fname,
            "version": _read_plugin_version(fpath),
            "size": os.path.getsize(fpath),
        })

    return {"plugins": plugins, "plugins_dir": plugins_dir, "error": None}


def search_umod(query: str = "", page: int = 1) -> dict:
    try:
        params = {"page": page, "per_page": 20, "sort": "downloads", "sortdir": "desc", "filter[game_slug]": "rust"}
        if query.strip():
            params["search"] = query.strip()
        url = UMOD_API + "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={"User-Agent": "RustServerManager/1.0", "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except Exception as exc:
        return {"error": str(exc), "data": [], "last_page": 1, "current_page": 1}


def install_plugin(config: dict, download_url: str, name: str) -> tuple[bool, str]:
    plugins_dir = _get_plugins_dir(config)
    if not plugins_dir:
        return False, "server_data_path non configuré"

    Path(plugins_dir).mkdir(parents=True, exist_ok=True)

    ext = ".cs" if download_url.endswith(".cs") else ".cs"
    dest = os.path.join(plugins_dir, name + ext)
    try:
        req = urllib.request.Request(download_url, headers={"User-Agent": "RustServerManager/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            content = resp.read()
        with open(dest, "wb") as f:
            f.write(content)
        return True, f"{name} installé dans {plugins_dir}"
    except Exception as exc:
        return False, str(exc)


def remove_plugin(config: dict, name: str) -> tuple[bool, str]:
    plugins_dir = _get_plugins_dir(config)
    if not plugins_dir:
        return False, "server_data_path non configuré"
    for ext in [".cs", ".js"]:
        p = os.path.join(plugins_dir, name + ext)
        if os.path.isfile(p):
            os.unlink(p)
            return True, f"{name} supprimé"
    return False, "Fichier plugin introuvable"


def _get_umod_plugin_info(name: str) -> Optional[dict]:
    url = f"https://umod.org/plugins/{name}.json"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "RustServerManager/1.0", "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            return json.loads(resp.read().decode())
    except Exception:
        return None


def check_updates(config: dict) -> list:
    installed = list_installed(config)
    results = []
    for p in installed.get("plugins", []):
        if not p.get("version"):
            continue
        info = _get_umod_plugin_info(p["name"])
        if not info:
            continue
        latest = info.get("latest_release_version") or info.get("version_formatted")
        if not latest:
            continue
        if latest.strip() != p["version"].strip():
            results.append({
                "name": p["name"],
                "filename": p["filename"],
                "installed_version": p["version"],
                "latest_version": latest,
                "download_url": info.get("download_url") or f"https://umod.org/plugins/{p['name']}.cs",
            })
    return results
