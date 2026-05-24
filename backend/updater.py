import os
import sys
import json
import time
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


def _ssl_opener():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))


def apply_update(download_url: str) -> tuple[bool, str]:
    """Download new .exe and launch VBScript replacer (Windows only)."""
    global _progress
    _progress = DownloadProgress()

    if not getattr(sys, "frozen", False):
        return False, "La mise à jour automatique nécessite l'application packagée (.exe)."

    if not download_url:
        return False, "Aucune URL de téléchargement disponible."

    if sys.platform != "win32":
        return False, "La mise à jour automatique est supportée sur Windows uniquement."

    current_exe = Path(sys.executable)
    tmp_exe = current_exe.parent / (current_exe.stem + ".update.exe")
    vbs_path = current_exe.parent / (current_exe.stem + "_updater.vbs")
    log_path = current_exe.parent / (current_exe.stem + "_updater.log")
    mei_path = getattr(sys, "_MEIPASS", "")
    pid = os.getpid()

    # ── 1. Download ──────────────────────────────────────────────────────────
    try:
        opener = _ssl_opener()
        with opener.open(download_url) as src:
            total = int(src.headers.get("Content-Length", 0))
            block = 65536
            count = 0
            with open(str(tmp_exe), "wb") as f:
                while True:
                    chunk = src.read(block)
                    if not chunk:
                        break
                    f.write(chunk)
                    count += 1
                    _progress.hook(count, block, total)
        _progress.percent = 100
    except Exception as exc:
        _progress.error = str(exc)
        return False, f"Échec du téléchargement : {exc}"

    # ── 2. Write VBScript replacer ───────────────────────────────────────────
    # VBScript avoids PowerShell execution-policy issues entirely.
    # It polls until the original PID is gone, then copies the new exe over.
    def esc(p: str) -> str:
        return str(p).replace('"', '""')

    vbs = f'''\
Dim oShell, oFS, logFile
Set oShell = CreateObject("WScript.Shell")
Set oFS   = CreateObject("Scripting.FileSystemObject")
Set logFile = oFS.OpenTextFile("{esc(log_path)}", 8, True)
logFile.WriteLine Now & " updater started, waiting for PID {pid}"

' Wait until original process is gone (max 30 s)
Dim waited
waited = 0
Do While waited < 30
    Dim oProc
    On Error Resume Next
    Set oProc = GetObject("winmgmts:{{impersonationLevel=impersonate}}!//./root/cimv2")
    Dim col
    Set col = oProc.ExecQuery("SELECT * FROM Win32_Process WHERE ProcessId = {pid}")
    Dim found
    found = (col.Count > 0)
    On Error GoTo 0
    If Not found Then Exit Do
    WScript.Sleep 1000
    waited = waited + 1
Loop
logFile.WriteLine Now & " process gone after " & waited & "s"

' Extra wait for file handles and Defender scan
WScript.Sleep 4000

' Delete old _MEIPASS extraction folder if present
''' + (f'''
On Error Resume Next
If oFS.FolderExists("{esc(mei_path)}") Then
    oFS.DeleteFolder "{esc(mei_path)}", True
End If
On Error GoTo 0
''' if mei_path else '') + f'''
' Copy new exe over old exe, retry up to 30 times
Dim retries, replaced
retries = 30
replaced = False
Do While retries > 0 And Not replaced
    On Error Resume Next
    oFS.CopyFile "{esc(tmp_exe)}", "{esc(current_exe)}", True
    If Err.Number = 0 Then
        replaced = True
        logFile.WriteLine Now & " copy succeeded"
    Else
        logFile.WriteLine Now & " copy failed (retry " & retries & "): " & Err.Description
        Err.Clear
    End If
    On Error GoTo 0
    If Not replaced Then WScript.Sleep 2000
    retries = retries - 1
Loop

If replaced Then
    ' Clean up temp file
    On Error Resume Next
    oFS.DeleteFile "{esc(tmp_exe)}", True
    On Error GoTo 0
    ' Relaunch
    logFile.WriteLine Now & " launching " & "{esc(current_exe)}"
    logFile.Close
    oShell.Run Chr(34) & "{esc(current_exe)}" & Chr(34), 1, False
Else
    logFile.WriteLine Now & " FAILED: gave up after all retries"
    logFile.Close
End If

' Self-delete
WScript.Sleep 1000
On Error Resume Next
oFS.DeleteFile WScript.ScriptFullName, True
'''

    try:
        vbs_path.write_text(vbs, encoding="utf-8")
    except Exception as exc:
        _progress.error = str(exc)
        return False, f"Impossible d'écrire le script de mise à jour : {exc}"

    # ── 3. Launch VBScript detached via wscript.exe ──────────────────────────
    try:
        subprocess.Popen(
            ["wscript.exe", str(vbs_path)],
            creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NO_WINDOW,
            close_fds=True,
        )
    except Exception as exc:
        _progress.error = str(exc)
        return False, f"Impossible de lancer le script de remplacement : {exc}"

    _progress.done = True
    # Give the frontend time to read progress.done.
    time.sleep(3)
    # Kill any WebView2 / Edge child processes so they release DLL handles
    # inside _MEIPASS before the temp dir gets removed.
    try:
        import psutil
        me = psutil.Process()
        for child in me.children(recursive=True):
            try:
                child.kill()
            except Exception:
                pass
    except Exception:
        pass
    # Hard-terminate the process so the PyInstaller bootloader skips its
    # _MEIPASS cleanup step (which pops the "Failed to remove temporary
    # directory" warning when WebView2 still holds DLLs). The VBScript
    # cleans the temp dir asynchronously with retries.
    if sys.platform == "win32":
        try:
            import ctypes
            ctypes.windll.kernel32.TerminateProcess(
                ctypes.windll.kernel32.GetCurrentProcess(), 0
            )
        except Exception:
            os._exit(0)
    else:
        os._exit(0)
    return True, "Mise à jour lancée, l'application va redémarrer."
