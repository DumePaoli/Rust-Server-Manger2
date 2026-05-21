import json
import os
from pathlib import Path


def _config_path() -> Path:
    env_dir = os.environ.get("RSM_CONFIG_DIR")
    if env_dir:
        d = Path(env_dir)
        d.mkdir(parents=True, exist_ok=True)
        return d / "server_config.json"
    return Path(__file__).parent / "server_config.json"


CONFIG_PATH = _config_path()

DEFAULT_CONFIG = {
    "server_name": "My Rust Server",
    "server_ip": "0.0.0.0",
    "server_port": 28015,
    "rcon_port": 28016,
    "rcon_password": "changeme",
    "max_players": 100,
    "map_size": 3500,
    "map_seed": 12345,
    "server_description": "A Rust server managed by RustManager",
    "server_url": "",
    "server_logo_url": "",
    "server_executable": "",
    "server_identity": "rust_server",
    "level": "Procedural Map",
    "save_interval": 600,
    "decay_scale": 1.0,
    "radiation": True,
    "pve": False,
    "oxide_enabled": False,
    "auto_update": True,
    "auto_wipe_map": False,
    "auto_wipe_blueprints": False,
    "wipe_schedule": "monthly",
}


def load_config() -> dict:
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH, "r") as f:
            data = json.load(f)
        # Merge with defaults to add any new keys
        return {**DEFAULT_CONFIG, **data}
    return DEFAULT_CONFIG.copy()


def save_config(config: dict) -> None:
    with open(CONFIG_PATH, "w") as f:
        json.dump(config, f, indent=2)
