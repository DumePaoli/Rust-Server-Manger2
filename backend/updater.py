import os
import sys
import json
import time
import urllib.request
import urllib.error
import subprocess
from pathlib import Path
from typing import Optional


# ── Version helpers ────────────────────────────────────────────────────────

def _parse_version(v: str) -> tuple:
    try:
        return tuple(int(x) for x in v.lstrip("v").split(".")[:3])
    except Exception:
        return (0, 0, 0)


def is_newer(latest: str, current: str) -> bool:
    return _parse_version(latest) > _parse_version(current)


# ── Update checker ─────────────────────────────────────────────────────────

class UpdateChecker:
    CACHE_TTL = 3600  # 1 hour

    def __init__(self, current_version: str, github_repo: str):
        self.current_version = current_version
        self.github_repo = github_repo
        self._cache: Optional[dict] = None
        self._cache_ts: float = 0

    def check(self, force: bool = False) -> dict:
        """Return update info dict. Uses in-memory cache to avoid hammering the API."""
        now = time.time()
        if not force and self._cache and (now - self._cache_ts) < self.CACHE_TTL:
            return self._cache

        result = self._fetch()
        self._cache = result
        self._cache_ts = now
        return result

    def _fetch(self) -> dict:
        url = f"https://api.github.com/repos/{self.github_repo}/releases/latest"
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "RustServerManager-Updater/1.0"},
            )
            with urllib.request.urlopen(req, timeout=6) as resp:
                data = json.loads(resp.read().decode())

            latest_tag = data.get("tag_name", "").lstrip("v")
            if not latest_tag:
                return self._no_update()

            if is_newer(latest_tag, self.current_version):
                exe_url = self._find_exe_asset(data.get("assets", []))
                return {
                    "available": True,
                    "latest_version": latest_tag,
                    "current_version": self.current_version,
                    "download_url": exe_url,
                    "changelog": data.get("body") or "",
                    "release_url": data.get("html_url", ""),
                }
            return self._no_update(latest_tag)

        except urllib.error.HTTPError as e:
            if e.code == 404:
                # No releases yet — silent, not an error
                return self._no_update()
            return {"available": False, "current_version": self.current_version, "error": f"HTTP {e.code}"}
        except Exception as exc:
            return {"available": False, "current_version": self.current_version, "error": str(exc)}

    def _no_update(self, latest: str = "") -> dict:
        return {
            "available": False,
            "latest_version": latest or self.current_version,
            "current_version": self.current_version,
        }

    @staticmethod
    def _find_exe_asset(assets: list) -> Optional[str]:
        for asset in assets:
            if asset.get("name", "").lower().endswith(".exe"):
                return asset["browser_download_url"]
        return None


# ── Self-updater (Windows .exe only) ──────────────────────────────────────

class DownloadProgress:
    def __init__(self):
        self.percent: int = 0
        self.done: bool = False
        self.error: Optional[str] = None

    def hook(self, count, block_size, total_size):
        if total_size > 0:
            self.percent = min(100, int(count * block_size * 100 / total_size))


_progress = DownloadProgress()


def get_download_progress() -> dict:
    return {
        "percent": _progress.percent,
        "done": _progress.done,
        "error": _progress.error,
    }


def apply_update(download_url: str) -> tuple[bool, str]:
    """Download the new .exe and schedule self-replacement via PowerShell (Windows only)."""
    global _progress
    _progress = DownloadProgress()

    if not getattr(sys, "frozen", False):
        return False, "La mise à jour automatique nécessite l'application packagée (.exe)."

    if not download_url:
        return False, "Aucune URL de téléchargement disponible."

    if sys.platform != "win32":
        return False, "La mise à jour automatique est supportée sur Windows uniquement."

    current_exe = Path(sys.executable)
    tmp_exe = Path(str(current_exe) + ".update")
    pid = os.getpid()

    try:
        urllib.request.urlretrieve(download_url, str(tmp_exe), reporthook=_progress.hook)
        _progress.percent = 100
    except Exception as exc:
        _progress.error = str(exc)
        return False, f"Échec du téléchargement : {exc}"

    # PowerShell script runs fully detached and windowless.
    # It kills this process by PID — more reliable than relying on the process to exit
    # on its own. The previous signal-file approach failed because webview.destroy() from
    # a background thread doesn't reliably unblock webview.start() on Windows, and
    # os._exit() from an executor thread can be intercepted. Stop-Process -Force is an
    # external TerminateProcess() call that bypasses all of that.
    mei_path = getattr(sys, "_MEIPASS", "")
    ps_path = Path(str(current_exe) + "_update.ps1")
    ps = (
        "Start-Sleep -Seconds 1\n"
        f"Stop-Process -Id {pid} -Force -ErrorAction SilentlyContinue\n"
        "Start-Sleep -Seconds 2\n"
        + (f'Remove-Item -Recurse -Force "{mei_path}" -ErrorAction SilentlyContinue\n' if mei_path else "")
        + "$retries = 20\n"
        "while ($retries -gt 0) {\n"
        "  try {\n"
        f'    Move-Item -Force "{tmp_exe}" "{current_exe}"\n'
        "    break\n"
        "  } catch {\n"
        "    Start-Sleep -Seconds 1\n"
        "    $retries--\n"
        "  }\n"
        "}\n"
        f'Start-Process "{current_exe}"\n'
        "Remove-Item $MyInvocation.MyCommand.Path -Force\n"
    )

    try:
        ps_path.write_text(ps, encoding="utf-8")
        subprocess.Popen(
            [
                "powershell",
                "-WindowStyle", "Hidden",
                "-NonInteractive",
                "-ExecutionPolicy", "Bypass",
                "-File", str(ps_path),
            ],
            creationflags=0x00000008 | 0x08000000,  # DETACHED_PROCESS | CREATE_NO_WINDOW
        )
    except Exception as exc:
        _progress.error = str(exc)
        return False, f"Échec du script de remplacement : {exc}"

    _progress.done = True
    # Sleep so the frontend can poll progress.done before PowerShell kills us (~1 s)
    time.sleep(3)
    # Hard fallback in case Stop-Process didn't fire
    os._exit(0)
    return True, "Mise à jour lancée, l'application va redémarrer."
