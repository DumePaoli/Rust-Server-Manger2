"""
prerequisites.py — check and silently install VC++, .NET 6, DirectX on Windows.
"""
import os
import sys
import subprocess
import threading
import tempfile
import shutil
import urllib.request
from typing import Optional

# ── Checks ───────────────────────────────────────────────────────────────────

def _check_vcredist() -> bool:
    if sys.platform != "win32":
        return True
    try:
        import winreg
        keys = [
            r"SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64",
            r"SOFTWARE\WOW6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\x64",
        ]
        for key_path in keys:
            try:
                with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path) as k:
                    installed = winreg.QueryValueEx(k, "Installed")[0]
                    if installed == 1:
                        return True
            except OSError:
                pass
    except Exception:
        pass
    # Fallback: DLL presence
    sys32 = os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "System32")
    return os.path.isfile(os.path.join(sys32, "vcruntime140.dll"))


def _check_dotnet6() -> bool:
    if sys.platform != "win32":
        return True
    try:
        kwargs = {"creationflags": subprocess.CREATE_NO_WINDOW} if sys.platform == "win32" else {}
        r = subprocess.run(
            ["dotnet", "--list-runtimes"],
            capture_output=True, text=True, timeout=8, **kwargs,
        )
        return "Microsoft.NETCore.App 6." in r.stdout
    except Exception:
        return False


def _check_directx() -> bool:
    if sys.platform != "win32":
        return True
    sys32 = os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "System32")
    return os.path.isfile(os.path.join(sys32, "d3d11.dll"))


# ── Registry ─────────────────────────────────────────────────────────────────

PREREQS: dict = {
    "vcredist": {
        "name": "Visual C++ 2015-2022 (x64)",
        "description": "Requis par RustDedicated.exe",
        "check": _check_vcredist,
        "url": "https://aka.ms/vs/17/release/vc_redist.x64.exe",
        "filename": "vc_redist.x64.exe",
        "args": ["/quiet", "/norestart"],
        "builtin": False,
    },
    "dotnet6": {
        "name": ".NET 6.0 Runtime (x64)",
        "description": "Recommandé pour la compatibilité",
        "check": _check_dotnet6,
        "url": "https://aka.ms/dotnet/6.0/dotnet-runtime-win-x64.exe",
        "filename": "dotnet-runtime-6.0-win-x64.exe",
        "args": ["/install", "/quiet", "/norestart"],
        "builtin": False,
    },
    "directx": {
        "name": "DirectX (D3D11)",
        "description": "Intégré à Windows 10/11",
        "check": _check_directx,
        "url": None,  # built-in on Win10/11 — no installer needed
        "filename": None,
        "args": [],
        "builtin": True,
    },
}

# ── Progress state ────────────────────────────────────────────────────────────

_progress: dict[str, dict] = {}  # pid -> {status, log, error}


def check_all() -> dict:
    result = {}
    for pid, info in PREREQS.items():
        try:
            installed = info["check"]()
        except Exception:
            installed = False
        result[pid] = {
            "name": info["name"],
            "description": info["description"],
            "installed": installed,
            "builtin": info["builtin"],
            "installable": info["url"] is not None,
        }
    return result


def get_progress() -> dict:
    return dict(_progress)


# ── Installer thread ──────────────────────────────────────────────────────────

def _install_thread(pid: str) -> None:
    info = PREREQS.get(pid)
    if not info or not info["url"]:
        return

    state: dict = {"status": "downloading", "log": [], "error": None}
    _progress[pid] = state

    def log(msg: str):
        state["log"].append(msg)

    tmp_dir = tempfile.mkdtemp(prefix="rsm_prereq_")
    try:
        dest = os.path.join(tmp_dir, info["filename"])
        log(f"Téléchargement de {info['name']}...")
        urllib.request.urlretrieve(info["url"], dest)
        log("Téléchargement terminé.")

        state["status"] = "installing"
        log("Installation en cours (quelques secondes)...")

        kwargs: dict = {}
        if sys.platform == "win32":
            kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW

        result = subprocess.run(
            [dest] + info["args"],
            capture_output=True, text=True, timeout=300, **kwargs,
        )

        # 0 = success, 3010 = success + reboot needed, 1638 = newer version already installed
        if result.returncode in (0, 1638):
            state["status"] = "done"
            log(f"{info['name']} installé avec succès.")
        elif result.returncode == 3010:
            state["status"] = "done"
            log(f"{info['name']} installé. Redémarrage recommandé.")
        else:
            state["status"] = "error"
            err = f"Code d'erreur : {result.returncode}"
            state["error"] = err
            log(f"Erreur d'installation — {err}")
            if result.stderr:
                log(result.stderr[:500])

    except urllib.error.URLError as exc:
        state["status"] = "error"
        state["error"] = f"Erreur réseau : {exc}"
        log(state["error"])
    except Exception as exc:
        state["status"] = "error"
        state["error"] = str(exc)
        log(f"Erreur : {exc}")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def install(pid: str) -> bool:
    if pid not in PREREQS or not PREREQS[pid]["url"]:
        return False
    _progress[pid] = {"status": "pending", "log": [], "error": None}
    t = threading.Thread(target=_install_thread, args=(pid,), daemon=True)
    t.start()
    return True
