import os
import sys
import json
import time
import base64
import ssl
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
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            with urllib.request.urlopen(req, timeout=6, context=ctx) as resp:
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
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))
        def _retrieve(url, dest, hook):
            with opener.open(url) as src:
                total = int(src.headers.get("Content-Length", 0))
                block = 8192
                count = 0
                with open(dest, "wb") as f:
                    while True:
                        chunk = src.read(block)
                        if not chunk:
                            break
                        f.write(chunk)
                        count += 1
                        hook(count, block, total)
        _retrieve(download_url, str(tmp_exe), _progress.hook)
        _progress.percent = 100
    except Exception as exc:
        _progress.error = str(exc)
        return False, f"Échec du téléchargement : {exc}"

    # Build the PowerShell update script.
    # Key design choices:
    #  - Launched via ShellExecuteW (not Popen) so it runs OUTSIDE PyInstaller's
    #    Windows Job Object; Popen children are killed when the job closes on parent exit.
    #  - Passed as base64 -EncodedCommand to bypass file-level execution policy.
    #  - Waits for the source file to be fully unlocked (AV scanners can hold the
    #    .exe.update for 1-3 min) before attempting Move-Item.
    #  - Self-cleanup via a detached cmd so PowerShell doesn't hold a lock on its
    #    own script file.
    mei_path = getattr(sys, "_MEIPASS", "")
    ps_path = Path(str(current_exe) + "_update.ps1")

    mei_line = (
        f'Remove-Item -Recurse -Force "{mei_path}" -ErrorAction SilentlyContinue\n'
        if mei_path else ""
    )
    ps = (
        f'$tmpExe  = "{tmp_exe}"\n'
        f'$curExe  = "{current_exe}"\n'
        f'$ps1Path = "{ps_path}"\n'
        # 1. Kill old process and wait (up to 20 s)
        "Start-Sleep -Seconds 1\n"
        f"Stop-Process -Id {pid} -Force -ErrorAction SilentlyContinue\n"
        f"$t = [DateTime]::Now.AddSeconds(20)\n"
        f"while ([DateTime]::Now -lt $t) {{\n"
        f"    if (-not (Get-Process -Id {pid} -ErrorAction SilentlyContinue)) {{ break }}\n"
        "    Start-Sleep -Milliseconds 500\n"
        "}\n"
        # 2. Extra pause for Windows to release file handles
        "Start-Sleep -Seconds 3\n"
        + mei_line
        # 3. Wait until the update file is no longer locked by AV (up to 3 min)
        + "$unlocked = $false\n"
        "$avWait = 180\n"
        "while ($avWait -gt 0 -and -not $unlocked) {\n"
        "  try {\n"
        "    $s = [IO.File]::Open($tmpExe, 'Open', 'ReadWrite', 'None')\n"
        "    $s.Close(); $s.Dispose()\n"
        "    $unlocked = $true\n"
        "  } catch { Start-Sleep -Seconds 1; $avWait-- }\n"
        "}\n"
        # 4. Replace exe
        "if ($unlocked) {\n"
        "  $moved = $false\n"
        "  $retries = 30\n"
        "  while ($retries -gt 0 -and -not $moved) {\n"
        "    try {\n"
        "      Move-Item -Force $tmpExe $curExe\n"
        "      $moved = $true\n"
        "    } catch { Start-Sleep -Seconds 1; $retries-- }\n"
        "  }\n"
        "  if (-not $moved) { Remove-Item $tmpExe -Force -ErrorAction SilentlyContinue }\n"
        "}\n"
        # 5. Launch updated exe
        "Start-Process $curExe\n"
        # 6. Self-cleanup via detached cmd (avoids PowerShell holding its own file lock)
        "Start-Process cmd -WindowStyle Hidden "
        "-ArgumentList \"/c timeout /t 3 /nobreak >nul 2>&1 && del /f /q `\"$ps1Path`\"\"\n"
    )

    try:
        ps_path.write_text(ps, encoding="utf-8")
    except Exception as exc:
        _progress.error = str(exc)
        return False, f"Impossible d'écrire le script de mise à jour : {exc}"

    # Encode as UTF-16LE for -EncodedCommand
    encoded = base64.b64encode(ps.encode("utf-16-le")).decode("ascii")
    ps_args = (
        f"-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass "
        f"-EncodedCommand {encoded}"
    )

    launched = False
    # Attempt 1: ShellExecuteW — creates process outside PyInstaller's Job Object
    try:
        import ctypes
        ret = ctypes.windll.shell32.ShellExecuteW(
            None, "open", "powershell.exe", ps_args, None, 0,
        )
        launched = int(ret) > 32
    except Exception:
        pass

    if not launched:
        # Attempt 2: Popen with CREATE_BREAKAWAY_FROM_JOB
        try:
            subprocess.Popen(
                ["powershell", "-NonInteractive", "-WindowStyle", "Hidden",
                 "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
                creationflags=0x01000000 | 0x08000000 | 0x00000008,  # BREAKAWAY|NO_WIN|DETACHED
                close_fds=True,
            )
            launched = True
        except OSError:
            pass

    if not launched:
        # Attempt 3: plain Popen (best-effort if job object allows child survival)
        try:
            subprocess.Popen(
                ["powershell", "-NonInteractive", "-WindowStyle", "Hidden",
                 "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
                creationflags=0x08000000 | 0x00000008,  # NO_WIN|DETACHED
                close_fds=True,
            )
            launched = True
        except Exception as exc:
            _progress.error = str(exc)
            return False, f"Échec du lancement du script de remplacement : {exc}"

    _progress.done = True
    # Sleep so the frontend can poll progress.done before PowerShell kills us (~1 s)
    time.sleep(3)
    # Hard fallback in case Stop-Process didn't fire
    os._exit(0)
    return True, "Mise à jour lancée, l'application va redémarrer."
