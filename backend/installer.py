import os
import sys
import subprocess
import threading
import urllib.request
import zipfile
import tarfile
from pathlib import Path
from typing import Optional

RUST_APP_ID = "258550"

STEAMCMD_CANDIDATES_WIN = [
    r"C:\steamcmd\steamcmd.exe",
    r"C:\SteamCMD\steamcmd.exe",
    r"C:\Steam\steamcmd.exe",
    r"C:\Program Files (x86)\Steam\steamcmd.exe",
]

STEAMCMD_CANDIDATES_LINUX = [
    "/usr/bin/steamcmd",
    "/usr/games/steamcmd",
    "/home/steam/steamcmd/steamcmd.sh",
    "/opt/steamcmd/steamcmd.sh",
]


class InstallProgress:
    def __init__(self):
        self.percent: int = 0
        self.status: str = "idle"  # idle | downloading | installing | done | error
        self._log: list[str] = []
        self.error: Optional[str] = None

    def log(self, line: str) -> None:
        self._log.append(line)
        if len(self._log) > 1000:
            self._log = self._log[-1000:]

    def get_log(self, last: int = 100) -> list[str]:
        return self._log[-last:]


_progress = InstallProgress()
_lock = threading.Lock()


def get_progress() -> dict:
    return {
        "percent": _progress.percent,
        "status": _progress.status,
        "log": _progress.get_log(),
        "error": _progress.error,
    }


def find_steamcmd(extra_path: str = "") -> Optional[str]:
    candidates = []
    if extra_path:
        candidates.append(extra_path)

    config_dir = os.environ.get("RSM_CONFIG_DIR", "")
    if config_dir:
        if sys.platform == "win32":
            candidates.append(os.path.join(config_dir, "steamcmd", "steamcmd.exe"))
        else:
            candidates.append(os.path.join(config_dir, "steamcmd", "steamcmd.sh"))

    if sys.platform == "win32":
        candidates += STEAMCMD_CANDIDATES_WIN
    else:
        candidates += STEAMCMD_CANDIDATES_LINUX

    for p in candidates:
        if os.path.isfile(p):
            return p
    return None


def _default_steamcmd_dir() -> str:
    if sys.platform == "win32":
        return r"C:\steamcmd"
    config_dir = os.environ.get("RSM_CONFIG_DIR", "")
    if config_dir:
        return os.path.join(config_dir, "steamcmd")
    return os.path.expanduser("~/steamcmd")


def get_status(extra_steamcmd_path: str = "") -> dict:
    steamcmd = find_steamcmd(extra_steamcmd_path)
    default_dir = _default_steamcmd_dir()
    return {
        "steamcmd_path": steamcmd,
        "steamcmd_found": steamcmd is not None,
        "default_steamcmd_dir": default_dir,
        "platform": sys.platform,
    }


def _download_steamcmd_thread(install_dir: str) -> None:
    global _progress
    _progress = InstallProgress()
    _progress.status = "downloading"

    Path(install_dir).mkdir(parents=True, exist_ok=True)

    if sys.platform == "win32":
        url = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip"
        dest = os.path.join(install_dir, "steamcmd.zip")
        exe = os.path.join(install_dir, "steamcmd.exe")
    else:
        url = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz"
        dest = os.path.join(install_dir, "steamcmd_linux.tar.gz")
        exe = os.path.join(install_dir, "steamcmd.sh")

    def hook(count, block_size, total_size):
        if total_size > 0:
            _progress.percent = min(95, int(count * block_size * 100 / total_size))

    try:
        _progress.log(f"Téléchargement de SteamCMD depuis Valve...")
        _progress.log(f"Destination : {install_dir}")
        urllib.request.urlretrieve(url, dest, reporthook=hook)

        _progress.log("Extraction en cours...")
        if sys.platform == "win32":
            with zipfile.ZipFile(dest, "r") as z:
                z.extractall(install_dir)
        else:
            with tarfile.open(dest, "r:gz") as t:
                t.extractall(install_dir)

        try:
            os.unlink(dest)
        except Exception:
            pass

        if sys.platform != "win32" and os.path.isfile(exe):
            os.chmod(exe, 0o755)

        if os.path.isfile(exe):
            _progress.percent = 100
            _progress.status = "done"
            _progress.log(f"SteamCMD installé : {exe}")
        else:
            _progress.status = "error"
            _progress.error = "Exécutable SteamCMD introuvable après extraction."
            _progress.log(_progress.error)

    except Exception as exc:
        _progress.error = str(exc)
        _progress.status = "error"
        _progress.log(f"Erreur : {exc}")


def start_download_steamcmd(install_dir: str) -> None:
    t = threading.Thread(target=_download_steamcmd_thread, args=(install_dir,), daemon=True)
    t.start()


def _parse_progress(line: str) -> None:
    if "progress:" in line.lower():
        try:
            pct_str = line.split("progress:")[1].strip().split()[0].rstrip("(")
            _progress.percent = min(99, int(float(pct_str)))
        except Exception:
            pass


# Rust Dedicated Server is ~22 GB uncompressed. Used to estimate download %.
_RUST_EXPECTED_BYTES = 22 * 1024 ** 3


def _dir_size_monitor(server_dir: str, stop_event: threading.Event, base_pct: int = 5) -> None:
    """Estimate install progress by watching how much data SteamCMD has written."""
    p = Path(server_dir)
    while not stop_event.is_set():
        try:
            total = sum(f.stat().st_size for f in p.rglob("*") if f.is_file())
            pct = base_pct + int(total * (99 - base_pct) / _RUST_EXPECTED_BYTES)
            pct = min(99, pct)
            if pct > _progress.percent:
                _progress.percent = pct
        except Exception:
            pass
        stop_event.wait(3)


def _tail_log_file(log_path: str, stop_event: threading.Event) -> None:
    """Read SteamCMD's own log file in parallel to catch buffered output."""
    try:
        p = Path(log_path)
        seen = 0
        while not stop_event.is_set():
            if p.exists():
                size = p.stat().st_size
                if size > seen:
                    with open(p, "r", encoding="utf-8", errors="replace") as f:
                        f.seek(seen)
                        for raw in f:
                            line = raw.strip()
                            if line:
                                _progress.log(f"[log] {line}")
                                _parse_progress(line)
                    seen = size
            threading.Event().wait(0.8)
    except Exception:
        pass


def _run_steamcmd(steamcmd_path: str, args: list) -> int:
    steamcmd_dir = str(Path(steamcmd_path).parent)
    log_path = os.path.join(steamcmd_dir, "logs", "stderr.txt")

    stop_tail = threading.Event()
    tail_thread = threading.Thread(target=_tail_log_file, args=(log_path, stop_tail), daemon=True)
    tail_thread.start()

    proc = subprocess.Popen(
        [steamcmd_path] + args,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        stdin=subprocess.DEVNULL,
        bufsize=0,
        **( {"creationflags": subprocess.CREATE_NO_WINDOW} if sys.platform == "win32" else {} ),
    )
    buf = b""
    while True:
        chunk = proc.stdout.read(4096)
        if not chunk:
            break
        buf += chunk
        parts = buf.replace(b"\r\n", b"\n").replace(b"\r", b"\n").split(b"\n")
        buf = parts[-1]
        for part in parts[:-1]:
            line = part.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            _progress.log(line)
            _parse_progress(line)
    if buf.strip():
        _progress.log(buf.decode("utf-8", errors="replace").strip())

    proc.wait()
    stop_tail.set()
    tail_thread.join(timeout=2)
    return proc.returncode


def _install_server_thread(steamcmd_path: str, server_dir: str) -> None:
    global _progress
    _progress = InstallProgress()
    _progress.status = "installing"

    Path(server_dir).mkdir(parents=True, exist_ok=True)

    _progress.log(f"SteamCMD : {steamcmd_path}")
    _progress.log(f"Dossier serveur : {server_dir}")
    _progress.log(f"App ID : {RUST_APP_ID} (Rust Dedicated Server)")
    _progress.log("─" * 40)

    try:
        # Pass 1: let SteamCMD self-update before the actual install
        _progress.log("Étape 1/2 — Mise à jour de SteamCMD...")
        _run_steamcmd(steamcmd_path, ["+quit"])
        _progress.log("─" * 40)

        # Pass 2: install Rust server
        _progress.log("Étape 2/2 — Téléchargement du serveur Rust...")
        _progress.log("(peut prendre 20-40 minutes)")
        _progress.log("─" * 40)
        _progress.percent = 5  # show we've started

        stop_size_mon = threading.Event()
        size_mon = threading.Thread(
            target=_dir_size_monitor,
            args=(server_dir, stop_size_mon, 5),
            daemon=True,
        )
        size_mon.start()

        ret = _run_steamcmd(steamcmd_path, [
            "+force_install_dir", server_dir,
            "+login", "anonymous",
            "+app_update", RUST_APP_ID, "validate",
            "+quit",
        ])

        stop_size_mon.set()
        size_mon.join(timeout=1)

        _progress.log("─" * 40)

        if ret == 0:
            exe = os.path.join(server_dir, "RustDedicated.exe" if sys.platform == "win32" else "RustDedicated")
            if os.path.isfile(exe):
                _progress.percent = 100
                _progress.status = "done"
                _progress.log("Installation terminée avec succès !")
                _progress.log(f"Exécutable : {exe}")
            else:
                _progress.status = "error"
                _progress.error = "RustDedicated introuvable après installation."
                _progress.log(_progress.error)
        else:
            _progress.status = "error"
            _progress.error = f"SteamCMD a retourné le code {ret} — vérifiez votre connexion et que les ports UDP 27015-27030 sont ouverts."
            _progress.log(_progress.error)

    except Exception as exc:
        _progress.error = str(exc)
        _progress.status = "error"
        _progress.log(f"Erreur critique : {exc}")


def start_install_server(steamcmd_path: str, server_dir: str) -> None:
    t = threading.Thread(target=_install_server_thread, args=(steamcmd_path, server_dir), daemon=True)
    t.start()


def get_server_executable(server_dir: str) -> Optional[str]:
    if sys.platform == "win32":
        exe = os.path.join(server_dir, "RustDedicated.exe")
    else:
        exe = os.path.join(server_dir, "RustDedicated")
    return exe if os.path.isfile(exe) else None
