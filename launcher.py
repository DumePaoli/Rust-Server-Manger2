import sys
import os
import threading
import time
import socket

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


# ── Main ───────────────────────────────────────────────────────────────────
def main():
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
