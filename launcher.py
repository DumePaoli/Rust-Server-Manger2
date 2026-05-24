import sys
import os
import threading
import time
import socket
import base64
import subprocess
from pathlib import Path

# ── Path setup (works both in dev and PyInstaller .exe) ───────────────────
if getattr(sys, 'frozen', False):
    BASE_DIR = sys._MEIPASS
    # Store config in %APPDATA%\RustServerManager (persists between runs)
    if os.name == 'nt':
        config_dir = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'RustServerManager')
    else:
        config_dir = os.path.expanduser('~/.rustservermanager')
    os.makedirs(config_dir, exist_ok=True)
    os.environ['RSM_CONFIG_DIR'] = config_dir
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    config_dir = BASE_DIR

BACKEND_DIR = os.path.join(BASE_DIR, 'backend')
sys.path.insert(0, BACKEND_DIR)
os.chdir(BACKEND_DIR)

# Signal file path — updater writes this to trigger a graceful window close
SHUTDOWN_SIGNAL = os.path.join(config_dir, '.shutdown_signal')

import uvicorn   # noqa: E402
import webview   # noqa: E402


# ── Helpers ────────────────────────────────────────────────────────────────
def find_free_port(start: int = 8000) -> int:
    for port in range(start, start + 20):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('127.0.0.1', port))
            return port
        except OSError:
            continue
    return start


def wait_for_server(port: int, timeout: float = 10.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=0.3):
                return
        except OSError:
            time.sleep(0.1)


def start_uvicorn(port: int) -> None:
    uvicorn.run('main:app', host='127.0.0.1', port=port, log_level='warning')


def _shutdown_watcher() -> None:
    """Poll for the shutdown signal file and destroy the webview window when found."""
    while True:
        time.sleep(0.5)
        if os.path.exists(SHUTDOWN_SIGNAL):
            try:
                os.unlink(SHUTDOWN_SIGNAL)
            except Exception:
                pass
            # Destroy the window — webview.start() will return and the process exits cleanly
            try:
                for win in webview.windows:
                    win.destroy()
            except Exception:
                pass
            break


# ── Pending update auto-retry ─────────────────────────────────────────────
def _retry_pending_update() -> bool:
    """If a previous update attempt left .exe.update + _update.ps1 behind
    (PowerShell killed by parent's Job Object before it could replace the exe),
    relaunch the script via ShellExecuteW so it runs outside any job, then exit.
    Returns True if a retry was launched (caller should exit immediately)."""
    if not (getattr(sys, "frozen", False) and sys.platform == "win32"):
        return False
    current_exe = Path(sys.executable)
    update_file = Path(str(current_exe) + ".update")
    ps1_file    = Path(str(current_exe) + "_update.ps1")
    if not (update_file.exists() and ps1_file.exists()):
        return False
    try:
        ps_content = ps1_file.read_text(encoding="utf-8")
    except Exception:
        return False
    encoded = base64.b64encode(ps_content.encode("utf-16-le")).decode("ascii")
    ps_args = (
        f"-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass "
        f"-EncodedCommand {encoded}"
    )
    launched = False
    try:
        import ctypes
        ret = ctypes.windll.shell32.ShellExecuteW(
            None, "open", "powershell.exe", ps_args, None, 0,
        )
        launched = int(ret) > 32
    except Exception:
        pass
    if not launched:
        try:
            subprocess.Popen(
                ["powershell", "-NonInteractive", "-WindowStyle", "Hidden",
                 "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
                creationflags=0x01000000 | 0x08000000 | 0x00000008,
                close_fds=True,
            )
            launched = True
        except Exception:
            pass
    if launched:
        time.sleep(5)
        os._exit(0)
    return launched


# ── Main ───────────────────────────────────────────────────────────────────
def main():
    # Apply any pending update left over from a previous run (job-object kill)
    if _retry_pending_update():
        return

    # Clean up any leftover signal from a previous crashed update
    if os.path.exists(SHUTDOWN_SIGNAL):
        os.unlink(SHUTDOWN_SIGNAL)

    port = find_free_port()
    url  = f'http://localhost:{port}'

    # Start FastAPI backend in a background thread
    server_thread = threading.Thread(target=start_uvicorn, args=(port,), daemon=True)
    server_thread.start()

    # Block until uvicorn is ready to accept connections
    wait_for_server(port)

    # Watch for shutdown signal in background
    threading.Thread(target=_shutdown_watcher, daemon=True).start()

    # Open a native desktop window — no browser, no address bar
    webview.create_window(
        title='Rust Server Manager',
        url=url,
        width=1280,
        height=800,
        min_size=(960, 640),
        background_color='#0d0d0f',
    )

    webview.start(debug=False)
    # When webview.start() returns, the process exits naturally —
    # allowing the PowerShell update script to replace the .exe


if __name__ == '__main__':
    main()
