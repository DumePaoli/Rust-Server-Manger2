import asyncio
import os
import signal
import subprocess
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

import psutil


@dataclass
class ServerStatus:
    running: bool = False
    pid: Optional[int] = None
    uptime_seconds: int = 0
    cpu_percent: float = 0.0
    memory_mb: float = 0.0
    started_at: Optional[str] = None


class ServerManager:
    def __init__(self):
        self._process: Optional[subprocess.Popen] = None
        self._started_at: Optional[datetime] = None
        self._console_log: list[str] = []
        self._log_callbacks: list[Callable[[str], None]] = []
        self._read_task: Optional[asyncio.Task] = None

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
        if not self.is_running or self._process is None:
            return ServerStatus(running=False)
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
            )
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return ServerStatus(running=False)

    def get_console_log(self) -> list[str]:
        return self._console_log.copy()

    async def start(self, config: dict) -> tuple[bool, str]:
        if self.is_running:
            return False, "Server is already running."

        executable = config.get("server_executable", "")
        if not executable:
            # Demo mode: simulate a running server
            self._emit("=== DEMO MODE (no executable configured) ===")
            self._emit("Server started in demo mode.")
            self._emit(f"Server: {config.get('server_name', 'My Server')}")
            self._emit(f"Port: {config.get('server_port', 28015)}")
            self._emit(f"Max Players: {config.get('max_players', 100)}")
            self._emit("Generating procedural map...")
            self._emit("Server is ready! Waiting for connections...")
            self._started_at = datetime.now()
            # We use a fake process sentinel
            self._process = _DemoProcess()
            return True, "Server started in demo mode."

        if not Path(executable).exists():
            return False, f"Executable not found: {executable}"

        cmd = self._build_command(executable, config)
        try:
            self._process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
            self._started_at = datetime.now()
            self._emit(f"Server process started (PID {self._process.pid})")
            self._read_task = asyncio.create_task(self._read_output())
            return True, f"Server started (PID {self._process.pid})"
        except Exception as e:
            return False, str(e)

    def _build_command(self, executable: str, config: dict) -> list[str]:
        return [
            executable,
            f"-batchmode",
            f"+server.ip {config.get('server_ip', '0.0.0.0')}",
            f"+server.port {config.get('server_port', 28015)}",
            f"+server.maxplayers {config.get('max_players', 100)}",
            f"+server.hostname \"{config.get('server_name', 'Rust Server')}\"",
            f"+server.description \"{config.get('server_description', '')}\"",
            f"+server.identity {config.get('server_identity', 'rust_server')}",
            f"+server.seed {config.get('map_seed', 12345)}",
            f"+server.worldsize {config.get('map_size', 3500)}",
            f"+server.saveinterval {config.get('save_interval', 600)}",
            f"+rcon.port {config.get('rcon_port', 28016)}",
            f"+rcon.password {config.get('rcon_password', 'changeme')}",
            f"+rcon.web 1",
            "-nographics",
            "-logFile server_output.log",
        ]

    async def _read_output(self) -> None:
        if self._process is None or not hasattr(self._process, "stdout"):
            return
        loop = asyncio.get_event_loop()
        try:
            while self.is_running:
                line = await loop.run_in_executor(None, self._process.stdout.readline)
                if not line:
                    break
                self._emit(line.rstrip())
        except Exception:
            pass
        self._emit("Server process ended.")

    async def stop(self) -> tuple[bool, str]:
        if not self.is_running:
            return False, "Server is not running."
        if isinstance(self._process, _DemoProcess):
            self._process = None
            self._started_at = None
            self._emit("Demo server stopped.")
            return True, "Demo server stopped."
        try:
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
            return True, "Server stopped."
        except Exception as e:
            return False, str(e)

    async def restart(self, config: dict) -> tuple[bool, str]:
        await self.stop()
        await asyncio.sleep(2)
        return await self.start(config)

    async def send_command(self, command: str) -> None:
        self._emit(f"> {command}")
        if isinstance(self._process, _DemoProcess):
            self._emit(f"[Demo] Command '{command}' acknowledged.")
            return
        if self._process and self._process.stdin:
            try:
                self._process.stdin.write(command + "\n")
                self._process.stdin.flush()
            except Exception:
                pass


class _DemoProcess:
    """Sentinel used in demo mode (no real subprocess)."""
    pid = 99999

    def poll(self):
        return None  # appears always running
