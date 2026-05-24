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
        self._stderr_task: Optional[asyncio.Task] = None
        self._last_raw: str = ""          # dedup: skip consecutive identical lines
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
        if cb not in self._log_callbacks:
            self._log_callbacks.append(cb)

    def remove_log_callback(self, cb: Callable[[str], None]) -> None:
        self._log_callbacks.discard(cb) if hasattr(self._log_callbacks, "discard") else None
        if cb in self._log_callbacks:
            self._log_callbacks.remove(cb)

    def _emit(self, line: str) -> None:
        # Skip consecutive identical lines — stdout+stderr can carry same content
        if line and line == self._last_raw:
            return
        self._last_raw = line
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

        server_dir = str(Path(executable).parent)
        cmd = self._build_command(executable, config)
        try:
            popen_kwargs: dict = dict(
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,   # read separately; dedup handles identical lines
                text=True,
                bufsize=1,
                cwd=server_dir,
            )
            if sys.platform == "win32":
                popen_kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP
                si = subprocess.STARTUPINFO()
                si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                si.wShowWindow = 0
                popen_kwargs["startupinfo"] = si
            self._process = subprocess.Popen(cmd, **popen_kwargs)
            self._started_at = datetime.now()
            self._last_raw = ""  # reset dedup state on new process
            self._restart_count = 0 if not self._stopping else self._restart_count
            self._emit(f"Server process started (PID {self._process.pid})")
            self._read_task = asyncio.create_task(self._read_output())
            self._stderr_task = asyncio.create_task(self._read_stderr())
            return True, f"Server started (PID {self._process.pid})"
        except Exception as e:
            return False, str(e)

    def _build_command(self, executable: str, config: dict) -> list[str]:
        # Each +cmd and its value must be SEPARATE list items so subprocess
        # passes them as distinct argv tokens — Rust parses argv not a shell string.
        # Use -logFile - to send Unity log to stdout so we can capture it via pipe.
        cmd = [
            executable,
            "-batchmode",
            "-nographics",
            "-logFile",           "-",
            "+server.ip",         str(config.get("server_ip", "0.0.0.0")),
            "+server.port",       str(config.get("server_port", 28015)),
            "+server.queryport",  str(config.get("query_port", 28017)),
            "+server.maxplayers", str(config.get("max_players", 100)),
            "+server.hostname",   str(config.get("server_name", "")).strip() or "Rust Server",
            "+server.description",str(config.get("server_description", "")),
            "+server.identity",   str(config.get("server_identity", "rust_server")),
            "+server.saveinterval",str(config.get("save_interval", 600)),
            "+rcon.port",         str(config.get("rcon_port", 28016)),
            "+rcon.password",     str(config.get("rcon_password", "changeme")),
            "+rcon.web",          "1",
        ]
        custom_map = config.get("custom_map_url", "")
        if custom_map:
            cmd += ["+server.levelurl", custom_map]
        else:
            cmd += [
                "+server.seed",      str(config.get("map_seed", 12345)),
                "+server.worldsize", str(config.get("map_size", 3500)),
                "+server.level",     str(config.get("level", "Procedural Map")),
            ]
        if config.get("gather_rate", 1.0) != 1.0:
            cmd += ["+server.gatherscale", str(config.get("gather_rate", 1.0))]
        if config.get("craft_rate", 1.0) != 1.0:
            cmd += ["+craft.instant", "1" if config.get("craft_rate", 1.0) == 0 else "0"]
        if config.get("pve"):
            cmd += ["+server.pve", "1"]
        if not config.get("radiation", True):
            cmd += ["+radiation.enabled", "false"]
        if config.get("hardcore"):
            cmd += ["+server.hardcore", "1"]
        admin_id = config.get("admin_steamid", "")
        if admin_id:
            cmd += ["+server.ownerid", admin_id]
        tags = config.get("server_tags", [])
        if tags:
            cmd += ["+server.tags", ",".join(tags)]
        return cmd

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

    async def _read_stderr(self) -> None:
        """Read stderr separately so player-join/error lines on stderr aren't lost."""
        if self._process is None or not hasattr(self._process, "stderr") or self._process.stderr is None:
            return
        loop = asyncio.get_event_loop()
        try:
            while self.is_running:
                line = await loop.run_in_executor(None, self._process.stderr.readline)
                if not line:
                    break
                self._emit(line.rstrip())
        except Exception:
            pass

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


