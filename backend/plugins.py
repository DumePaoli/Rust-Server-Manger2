import io
import os
import sys
import json
import re
import ssl
import urllib.request
import urllib.parse
import zipfile
from pathlib import Path
from typing import Optional


def _ssl_ctx() -> ssl.SSLContext:
    """SSL context using certifi CA bundle — required in PyInstaller frozen builds."""
    import certifi
    return ssl.create_default_context(cafile=certifi.where())

UMOD_API = "https://umod.org/plugins.json"
CODEFLING_API = "https://codefling.com/api"


def _codefling_config_path() -> "Path":
    env_dir = os.environ.get("RSM_CONFIG_DIR")
    if env_dir:
        d = Path(env_dir)
        d.mkdir(parents=True, exist_ok=True)
        return d / "codefling_config.json"
    return Path(__file__).parent / "codefling_config.json"


def load_codefling_config() -> dict:
    p = _codefling_config_path()
    if p.exists():
        with open(p, "r") as f:
            return json.load(f)
    return {"api_key": ""}


def save_codefling_config(cfg: dict) -> None:
    p = _codefling_config_path()
    with open(p, "w") as f:
        json.dump(cfg, f, indent=2)

_FRAMEWORK_REPOS = {
    "carbon": "CarbonCommunity/Carbon",
    "oxide":  "OxideMod/Oxide.Rust",
}


def _get_server_dir(config: dict) -> Optional[str]:
    exe = config.get("server_executable", "").strip()
    if exe:
        d = os.path.dirname(exe)
        if os.path.isdir(d):
            return d
    return None


def _get_github_latest_release(repo: str) -> Optional[dict]:
    url = f"https://api.github.com/repos/{repo}/releases/latest"
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "RustServerManager/1.0",
            "Accept": "application/vnd.github+json",
        })
        with urllib.request.urlopen(req, timeout=15, context=_ssl_ctx()) as resp:
            return json.loads(resp.read().decode())
    except Exception:
        return None


def get_framework_status(config: dict) -> dict:
    """Return installed status + latest available version for Carbon and Oxide."""
    server_dir = _get_server_dir(config)

    def _installed(name: str) -> bool:
        if not server_dir:
            return False
        if name == "carbon":
            return (
                os.path.isdir(os.path.join(server_dir, "carbon")) or
                os.path.isfile(os.path.join(server_dir, "HarmonyMods", "Carbon.dll"))
            )
        if name == "oxide":
            return os.path.isdir(os.path.join(server_dir, "oxide"))
        return False

    carbon_rel = _get_github_latest_release(_FRAMEWORK_REPOS["carbon"])
    oxide_rel  = _get_github_latest_release(_FRAMEWORK_REPOS["oxide"])

    return {
        "carbon": {
            "installed":      _installed("carbon"),
            "latest_version": carbon_rel.get("tag_name") if carbon_rel else None,
            "server_dir":     server_dir,
        },
        "oxide": {
            "installed":      _installed("oxide"),
            "latest_version": oxide_rel.get("tag_name") if oxide_rel else None,
            "server_dir":     server_dir,
        },
    }


def install_framework(config: dict, name: str) -> tuple[bool, str]:
    """Download and extract Carbon or Oxide into the server directory."""
    name = name.lower()
    if name not in _FRAMEWORK_REPOS:
        return False, f"Framework inconnu: {name}"

    server_dir = _get_server_dir(config)
    if not server_dir:
        data_path = config.get("server_data_path", "").strip()
        if data_path and os.path.isdir(data_path):
            server_dir = data_path
        else:
            return False, "Chemin de l'exécutable serveur non configuré (Server Settings → Advanced)"

    release = _get_github_latest_release(_FRAMEWORK_REPOS[name])
    if not release:
        return False, f"Impossible de récupérer la dernière version de {name.capitalize()} depuis GitHub"

    assets = release.get("assets", [])
    tag = release.get("tag_name", "")

    if name == "carbon":
        keyword = "Windows" if sys.platform == "win32" else "Linux"
        asset = next((a for a in assets if keyword in a["name"] and "Release" in a["name"] and a["name"].endswith(".zip")), None)
        if not asset:
            asset = next((a for a in assets if a["name"].endswith(".zip")), None)
    else:  # oxide
        asset = next((a for a in assets if a["name"] == "Oxide.Rust.zip"), None)
        if not asset:
            asset = next((a for a in assets if a["name"].endswith(".zip")), None)

    if not asset:
        return False, f"Aucun asset ZIP trouvé dans la release {name.capitalize()} {tag}"

    dl_url = asset["browser_download_url"]
    try:
        req = urllib.request.Request(dl_url, headers={"User-Agent": "RustServerManager/1.0"})
        with urllib.request.urlopen(req, timeout=180, context=_ssl_ctx()) as resp:
            data = resp.read()
    except Exception as exc:
        return False, f"Erreur de téléchargement: {exc}"

    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            zf.extractall(server_dir)
    except Exception as exc:
        return False, f"Erreur d'extraction: {exc}"

    return True, f"{name.capitalize()} {tag} installé dans {server_dir}"


def _get_plugins_dir(config: dict) -> Optional[str]:
    candidates = []

    data_path = config.get("server_data_path", "").strip()
    if data_path and os.path.isdir(data_path):
        for sub in ["carbon/plugins", "Carbon/plugins", "oxide/plugins", "Oxide/plugins"]:
            candidates.append(os.path.join(data_path, sub))

    server_dir = _get_server_dir(config)
    if server_dir:
        for sub in ["carbon/plugins", "Carbon/plugins", "oxide/plugins", "Oxide/plugins"]:
            candidates.append(os.path.join(server_dir, sub))

    for p in candidates:
        if os.path.isdir(p):
            return p

    if server_dir:
        return os.path.join(server_dir, "carbon/plugins")
    if data_path:
        return os.path.join(data_path, "carbon/plugins")
    return None


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
        with urllib.request.urlopen(req, timeout=10, context=_ssl_ctx()) as resp:
            return json.loads(resp.read().decode())
    except Exception as exc:
        return {"error": str(exc), "data": [], "last_page": 1, "current_page": 1}


def install_plugin(config: dict, download_url: str, name: str) -> tuple[bool, str]:
    try:
        _validate_plugin_name(name)
    except ValueError as exc:
        return False, str(exc)

    plugins_dir = _get_plugins_dir(config)
    if not plugins_dir:
        return False, "server_data_path non configuré"

    Path(plugins_dir).mkdir(parents=True, exist_ok=True)

    ext = ".cs" if download_url.endswith(".cs") else ".cs"
    dest = os.path.join(plugins_dir, name + ext)
    try:
        _assert_within_dir(dest, plugins_dir)
    except ValueError as exc:
        return False, str(exc)
    try:
        req = urllib.request.Request(download_url, headers={"User-Agent": "RustServerManager/1.0"})
        with urllib.request.urlopen(req, timeout=30, context=_ssl_ctx()) as resp:
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
        with urllib.request.urlopen(req, timeout=8, context=_ssl_ctx()) as resp:
            return json.loads(resp.read().decode())
    except Exception:
        return None


_PLUGIN_NAME_RE = re.compile(r'^[A-Za-z0-9_-]+$')
_CODEFLING_HOSTS = (".codefling.com",)


def _validate_plugin_name(name: str) -> None:
    if not _PLUGIN_NAME_RE.match(name):
        raise ValueError(f"Nom de plugin invalide: {name!r}")


def _assert_within_dir(dest: str, plugins_dir: str) -> None:
    real_dest = os.path.realpath(dest)
    real_dir = os.path.realpath(plugins_dir)
    if not real_dest.startswith(real_dir + os.sep) and real_dest != real_dir:
        raise ValueError(f"Path traversal détecté: {dest!r}")


def _validate_codefling_url(url: str) -> None:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https":
        raise ValueError(f"URL doit être HTTPS: {url!r}")
    host = parsed.netloc.lower().split(":")[0]
    if not any(host == h.lstrip(".") or host.endswith(h) for h in _CODEFLING_HOSTS):
        raise ValueError(f"Domaine non autorisé: {host!r}")


def search_codefling(query: str = "", page: int = 1, api_key: str = "") -> dict:
    try:
        params: dict = {"categories": "7", "page": page, "per_page": 20}
        if query.strip():
            params["search_term"] = query.strip()
        url = f"{CODEFLING_API}/downloads/files?" + urllib.parse.urlencode(params)
        headers = {"User-Agent": "RustServerManager/1.0", "Accept": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=15, context=_ssl_ctx()) as resp:
            return json.loads(resp.read().decode())
    except Exception as exc:
        return {"error": str(exc), "results": [], "totalPages": 1, "totalResults": 0}


def install_codefling_plugin(config: dict, plugin_id: int, name: str, api_key: str) -> tuple[bool, str]:
    try:
        _validate_plugin_name(name)
    except ValueError as exc:
        return False, str(exc)

    plugins_dir = _get_plugins_dir(config)
    if not plugins_dir:
        return False, "server_data_path non configuré"

    Path(plugins_dir).mkdir(parents=True, exist_ok=True)

    dest = os.path.join(plugins_dir, name + ".cs")
    try:
        _assert_within_dir(dest, plugins_dir)
    except ValueError as exc:
        return False, str(exc)

    auth_headers = {"User-Agent": "RustServerManager/1.0", "Accept": "application/json"}
    if api_key:
        auth_headers["Authorization"] = f"Bearer {api_key}"

    try:
        info_url = f"{CODEFLING_API}/downloads/files/{plugin_id}"
        req = urllib.request.Request(info_url, headers=auth_headers)
        with urllib.request.urlopen(req, timeout=10, context=_ssl_ctx()) as resp:
            info = json.loads(resp.read().decode())
    except Exception as exc:
        return False, f"Impossible de récupérer les infos du plugin: {exc}"

    download_url = info.get("downloadUrl") or info.get("url")
    if not download_url:
        return False, "URL de téléchargement introuvable — vérifiez votre clé API CodeFling"

    try:
        _validate_codefling_url(download_url)
    except ValueError as exc:
        return False, f"URL de téléchargement refusée: {exc}"

    dl_headers = {"User-Agent": "RustServerManager/1.0"}
    if api_key:
        dl_headers["Authorization"] = f"Bearer {api_key}"

    try:
        dl_req = urllib.request.Request(download_url, headers=dl_headers)
        with urllib.request.urlopen(dl_req, timeout=60, context=_ssl_ctx()) as resp:
            content = resp.read()
    except Exception as exc:
        return False, f"Erreur de téléchargement: {exc}"

    try:
        with open(dest, "wb") as f:
            f.write(content)
    except Exception as exc:
        return False, f"Erreur d'écriture: {exc}"

    return True, f"{name} installé dans {plugins_dir}"


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
