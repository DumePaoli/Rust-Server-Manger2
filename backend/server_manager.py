import asyncio
import os
import signal
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

import psutil
from players import PlayerManager


@dataclass
class ServerStatus:
    running: bool = False
    pid: Optional[int] = None
    uptime_seconds: int = 0
    cpu_percent: float = 0.0
    memory_mb: float = 0.0
    started_at: Optional[str] = None
    auto_restart: bool = False
    restart_count: int = 0
    last_crash_at: Optional[str] = None


class ServerManager:
    def __init__(self):
        self._process: Optional[subprocess.Popen] = None
        self._started_at: Optional[datetime] = None
        self._console_log: list[str] = []
        self._log_callbacks: list[Callable[[str], None]] = []
        self._read_task: Optional[asyncio.Task] = None
        self.players = PlayerManager()
        # Auto-restart state
        self._config: Optional[dict] = None
        self._stopping: bool = False
        self._auto_restart: bool = False
        self._auto_restart_delay: int = 10
        self._auto_restart_max: int = 5
        self._restart_count: int = 0
        self._last_crash_at: Optional[str] = None

    def add_log_callback(self, cb: Callable[[str], None]) -> None:
        self._log_callbacks.append(cb)

    def remove_log_callback(self, cb: Callable[[str], None]) -> None:
        self._log_callbacks.discard(cb) if hasattr(self._log_callbacks, "discard") else None
        if cb in self._log_callbacks:
            self._log_callbacks.remove(cb)

    def _emit(self, line: str) -> None:
        timestamp = datetime.now().strftime("%H:%M:%S")
        entry = f"[{timestamp}] {line}"
        self._console_log.append(entry)
        if len(self._console_log) > 500:
            self._console_log = self._console_log[-500:]
        self.players.on_log_line(line)
        for cb in self._log_callbacks:
            try:
                cb(entry)
            except Exception:
                pass

    @property
    def is_running(self) -> bool:
        if self._process is None:
            return False
        return self._process.poll() is None

    def get_status(self) -> ServerStatus:
        base = dict(
            auto_restart=self._auto_restart,
            restart_count=self._restart_count,
            last_crash_at=self._last_crash_at,
        )
        if not self.is_running or self._process is None:
            return ServerStatus(running=False, **base)
        try:
            proc = psutil.Process(self._process.pid)
            mem = proc.memory_info().rss / (1024 * 1024)
            cpu = proc.cpu_percent(interval=0.1)
            uptime = int((datetime.now() - self._started_at).total_seconds()) if self._started_at else 0
            return ServerStatus(
                running=True,
                pid=self._process.pid,
                uptime_seconds=uptime,
                cpu_percent=cpu,
                memory_mb=round(mem, 1),
                started_at=self._started_at.isoformat() if self._started_at else None,
                **base,
            )
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return ServerStatus(running=False, **base)

    def get_console_log(self) -> list[str]:
        return self._console_log.copy()

    async def start(self, config: dict) -> tuple[bool, str]:
        if self.is_running:
            return False, "Server is already running."

        self._config = config
        self._stopping = False
        self._auto_restart = bool(config.get("auto_restart", False))
        self._auto_restart_delay = int(config.get("auto_restart_delay", 10))
        self._auto_restart_max = int(config.get("auto_restart_max", 5))

        executable = config.get("server_executable", "")
        if not executable:
            return False, "Aucun exécutable configuré. Renseignez le chemin dans Paramètres serveur → Avancé."

        if not Path(executable).exists():
            return False, f"Executable not found: {executable}"

        cmd = self._build_command(executable, config)
        try:
            kwargs = dict(
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                bufsize=0,
                cwd=str(Path(executable).parent),
            )
            if sys.platform == "win32":
                kwargs["creationflags"] = (
                    subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP
                )
                si = subprocess.STARTUPINFO()
                si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                si.wShowWindow = 0  # SW_HIDE
                kwargs["startupinfo"] = si
            self._process = subprocess.Popen(cmd, **kwargs)
            self._started_at = datetime.now()
            self._restart_count = 0 if not self._stopping else self._restart_count
            self._emit(f"Server process started (PID {self._process.pid})")
            if sys.platform == "win32":
                self._spawn_window_hider(self._process.pid)
            self._read_task = asyncio.create_task(self._read_output())
            return True, f"Server started (PID {self._process.pid})"
        except Exception as e:
            return False, str(e)

    def _spawn_window_hider(self, pid: int) -> None:
        """Hide all top-level windows owned by the child PID (Unity allocates
        a console after spawn that CREATE_NO_WINDOW cannot prevent)."""
        import threading

        def worker():
            import time
            import ctypes
            from ctypes import wintypes

            user32 = ctypes.windll.user32
            EnumWindows = user32.EnumWindows
            GetWindowThreadProcessId = user32.GetWindowThreadProcessId
            ShowWindow = user32.ShowWindow
            IsWindowVisible = user32.IsWindowVisible

            EnumWindowsProc = ctypes.WINFUNCTYPE(
                ctypes.c_bool, wintypes.HWND, wintypes.LPARAM
            )

            def hide_pid_windows() -> int:
                hidden = [0]

                def cb(hwnd, _):
                    owner_pid = wintypes.DWORD()
                    GetWindowThreadProcessId(hwnd, ctypes.byref(owner_pid))
                    if owner_pid.value == pid and IsWindowVisible(hwnd):
                        ShowWindow(hwnd, 0)  # SW_HIDE
                        hidden[0] += 1
                    return True

                EnumWindows(EnumWindowsProc(cb), 0)
                return hidden[0]

            # Retry over 10s — Unity console may appear late.
            for _ in range(20):
                if self._process is None or self._process.poll() is not None:
                    return
                hide_pid_windows()
                time.sleep(0.5)

        t = threading.Thread(target=worker, daemon=True)
        t.start()

    def _build_command(self, executable: str, config: dict) -> list[str]:
        cmd = [
            executable,
            "-batchmode",
            f"+server.ip {config.get('server_ip', '0.0.0.0')}",
            f"+server.port {config.get('server_port', 28015)}",
            f"+server.maxplayers {config.get('max_players', 100)}",
            f"+server.hostname \"{config.get('server_name', 'Rust Server')}\"",
            f"+server.description \"{config.get('server_description', '')}\"",
            f"+server.identity {config.get('server_identity', 'rust_server')}",
            f"+server.saveinterval {config.get('save_interval', 600)}",
            f"+rcon.port {config.get('rcon_port', 28016)}",
            f"+rcon.password {config.get('rcon_password', 'changeme')}",
            f"+rcon.web 1",
            "-nographics",
        ]
        custom_map = config.get("custom_map_url", "")
        if custom_map:
            cmd.append(f"+server.levelurl \"{custom_map}\"")
        else:
            cmd += [
                f"+server.seed {config.get('map_seed', 12345)}",
                f"+server.worldsize {config.get('map_size', 3500)}",
                f"+server.level \"{config.get('level', 'Procedural Map')}\"",
            ]
        if config.get("gather_rate", 1.0) != 1.0:
            cmd.append(f"+server.gatherscale {config.get('gather_rate', 1.0)}")
        if config.get("craft_rate", 1.0) != 1.0:
            cmd.append(f"+craft.instant {1 if config.get('craft_rate', 1.0) == 0 else 0}")
        if config.get("pve"):
            cmd.append("+server.pve 1")
        if not config.get("radiation", True):
            cmd.append("+radiation.enabled false")
        if config.get("hardcore"):
            cmd.append("+server.hardcore 1")
        admin_id = config.get("admin_steamid", "")
        if admin_id:
            cmd.append(f"+server.ownerid {admin_id}")
        tags = config.get("server_tags", [])
        if tags:
            cmd.append(f"+server.tags \"{','.join(tags)}\"")
        return cmd

    async def _read_output(self) -> None:
        if self._process is None or not hasattr(self._process, "stdout"):
            return
        loop = asyncio.get_event_loop()

        def _read_chunks():
            buf = b""
            while True:
                chunk = self._process.stdout.read(512)
                if not chunk:
                    break
                buf += chunk
                parts = buf.replace(b"\r\n", b"\n").replace(b"\r", b"\n").split(b"\n")
                buf = parts[-1]
                for part in parts[:-1]:
                    line = part.decode("utf-8", errors="replace").strip()
                    if line:
                        self._emit(line)
            if buf.strip():
                self._emit(buf.decode("utf-8", errors="replace").strip())

        try:
            await loop.run_in_executor(None, _read_chunks)
        except Exception:
            pass
        self._emit("Server process ended.")

        # Auto-restart on unexpected exit
        if not self._stopping and self._auto_restart and self._config:
            if self._restart_count < self._auto_restart_max:
                self._last_crash_at = datetime.now().isoformat()
                self._restart_count += 1
                self._emit(
                    f"[Auto-restart] Crash détecté — redémarrage dans {self._auto_restart_delay}s "
                    f"(tentative {self._restart_count}/{self._auto_restart_max})"
                )
                await asyncio.sleep(self._auto_restart_delay)
                if not self._stopping:
                    await self.start(self._config)
            else:
                self._emit(
                    f"[Auto-restart] Nombre maximum de redémarrages atteint ({self._auto_restart_max}). "
                    "Intervention manuelle requise."
                )

    async def stop(self) -> tuple[bool, str]:
        if not self.is_running:
            return False, "Server is not running."
        try:
            self._stopping = True
            self._process.terminate()
            self._emit("SIGTERM sent to server process...")
            await asyncio.sleep(5)
            if self._process.poll() is None:
                self._process.kill()
                self._emit("Server force-killed.")
            else:
                self._emit("Server stopped gracefully.")
            self._process = None
            self._started_at = None
            self.players.clear()
            return True, "Server stopped."
        except Exception as e:
            return False, str(e)

    async def restart(self, config: dict) -> tuple[bool, str]:
        await self.stop()
        await asyncio.sleep(2)
        return await self.start(config)

    async def send_command(self, command: str) -> None:
        self._emit(f"> {command}")
        if self._process and self._process.stdin:
            try:
                self._process.stdin.write(command + "\n")
                self._process.stdin.flush()
            except Exception:
                pass


