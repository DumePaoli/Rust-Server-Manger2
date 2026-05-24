import json
import os
import uuid
from pathlib import Path
from typing import Optional

from server_manager import ServerManager

_CFG_DIR = Path(os.environ.get("RSM_CONFIG_DIR", Path.home() / "AppData/Roaming/RustServerManager"))
_SERVERS_FILE = _CFG_DIR / "servers.json"

_SERVER_DEFAULTS = {
    "server_name": "My Rust Server",
    "server_description": "",
    "server_ip": "0.0.0.0",
    "server_port": 28015,
    "rcon_port": 28016,
    "rcon_password": "changeme",
    "rcon_auto_connect": False,
    "query_port": 28017,
    "max_players": 100,
    "level": "Procedural Map",
    "map_size": 3500,
    "map_seed": 12345,
    "custom_map_url": "",
    "server_executable": "",
    "server_identity": "rust_server",
    "server_data_path": "",
    "save_interval": 600,
    "gather_rate": 1.0,
    "craft_rate": 1.0,
    "pve": False,
    "radiation": True,
    "hardcore": False,
    "auto_restart": False,
    "auto_restart_delay": 10,
    "auto_restart_max": 5,
}


class ServerEntry:
    def __init__(self, id_: str, name: str, config: dict):
        self.id   = id_
        self.name = name
        self.config: dict = config
        self.manager: ServerManager = ServerManager()


class ServerRegistry:
    def __init__(self):
        self._servers: dict[str, ServerEntry] = {}
        self._active_id: str = ""
        self._player_connect_cb = None
        self._player_disconnect_cb = None
        self._log_cbs: list = []
        self._on_active_change = None
        self._load()

    # ── persistence ─────────────────────────────────────────────────────────

    def _load(self) -> None:
        try:
            data = json.loads(_SERVERS_FILE.read_text())
            for s in data.get("servers", []):
                e = ServerEntry(s["id"], s["name"], s.get("config", {}))
                self._servers[s["id"]] = e
            self._active_id = data.get("active_id", "")
        except Exception:
            pass

        if not self._servers:
            self._migrate_legacy()

        if self._active_id not in self._servers:
            self._active_id = next(iter(self._servers)) if self._servers else ""

    def _migrate_legacy(self) -> None:
        """Import the existing single-server config as the first server entry."""
        try:
            from config import load_config
            cfg = load_config()
        except Exception:
            cfg = {}
        id_ = "default"
        name = cfg.get("server_name", "Serveur Principal")
        self._servers[id_] = ServerEntry(id_, name, cfg)
        self._active_id = id_
        self._save()

    def _save(self) -> None:
        _CFG_DIR.mkdir(parents=True, exist_ok=True)
        _SERVERS_FILE.write_text(json.dumps({
            "active_id": self._active_id,
            "servers": [
                {"id": e.id, "name": e.name, "config": e.config}
                for e in self._servers.values()
            ],
        }, indent=2))

    # ── query ────────────────────────────────────────────────────────────────

    def get_active(self) -> Optional[ServerEntry]:
        return self._servers.get(self._active_id)

    def get_active_manager(self) -> Optional[ServerManager]:
        e = self.get_active()
        return e.manager if e else None

    def list_servers(self) -> list:
        return [
            {
                "id": e.id,
                "name": e.name,
                "active": e.id == self._active_id,
                "running": e.manager.is_running,
                "port": e.config.get("server_port", 28015),
            }
            for e in self._servers.values()
        ]

    # ── mutations ────────────────────────────────────────────────────────────

    def set_active(self, id_: str) -> bool:
        if id_ not in self._servers:
            return False
        self._active_id = id_
        self._save()
        e = self._servers[id_]
        if self._player_connect_cb:
            e.manager.players.set_connect_cb(self._player_connect_cb)
        if self._player_disconnect_cb:
            e.manager.players.set_disconnect_cb(self._player_disconnect_cb)
        for cb in self._log_cbs:
            e.manager.add_log_callback(cb)
        if self._on_active_change:
            try:
                self._on_active_change(e.manager)
            except Exception:
                pass
        return True

    def add_log_callback(self, cb) -> None:
        if cb not in self._log_cbs:
            self._log_cbs.append(cb)
            m = self.get_active_manager()
            if m:
                m.add_log_callback(cb)

    def set_on_active_change(self, cb) -> None:
        self._on_active_change = cb

    def add_server(self, name: str, config: dict) -> ServerEntry:
        id_ = str(uuid.uuid4())[:8]
        cfg = {**_SERVER_DEFAULTS, **config}
        e = ServerEntry(id_, name, cfg)
        if self._player_connect_cb:
            e.manager.players.set_connect_cb(self._player_connect_cb)
        if self._player_disconnect_cb:
            e.manager.players.set_disconnect_cb(self._player_disconnect_cb)
        self._servers[id_] = e
        self._save()
        return e

    def update_server(self, id_: str, name: str, config: dict) -> bool:
        if id_ not in self._servers:
            return False
        e = self._servers[id_]
        e.name = name
        e.config = config
        self._save()
        return True

    def delete_server(self, id_: str) -> tuple[bool, str]:
        if id_ not in self._servers:
            return False, "Serveur introuvable"
        if len(self._servers) <= 1:
            return False, "Impossible de supprimer le dernier serveur"
        e = self._servers[id_]
        if e.manager.is_running:
            return False, "Arrêtez le serveur avant de le supprimer"
        del self._servers[id_]
        if self._active_id == id_:
            self._active_id = next(iter(self._servers))
        self._save()
        return True, "Serveur supprimé"

    def get_config(self, id_: str) -> Optional[dict]:
        e = self._servers.get(id_)
        return dict(e.config) if e else None

    def save_config(self, id_: str, config: dict) -> bool:
        if id_ not in self._servers:
            return False
        e = self._servers[id_]
        e.config = config
        e.name = config.get("server_name", e.name)
        self._save()
        return True

    # ── player notification callbacks ────────────────────────────────────────

    def set_player_callbacks(self, on_connect, on_disconnect) -> None:
        self._player_connect_cb  = on_connect
        self._player_disconnect_cb = on_disconnect
        for e in self._servers.values():
            e.manager.players.set_connect_cb(on_connect)
            e.manager.players.set_disconnect_cb(on_disconnect)


registry = ServerRegistry()
