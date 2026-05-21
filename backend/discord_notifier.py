import json
import os
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional


def _discord_config_path() -> Path:
    env_dir = os.environ.get("RSM_CONFIG_DIR")
    if env_dir:
        d = Path(env_dir)
        d.mkdir(parents=True, exist_ok=True)
        return d / "discord_config.json"
    return Path(__file__).parent / "discord_config.json"


DISCORD_CONFIG_PATH = _discord_config_path()

EVENT_DEFAULTS = {
    "server_start": {
        "enabled": True,
        "title": "Serveur démarré",
        "message": "Le serveur Rust est en ligne !",
        "color": 3066993,   # green
    },
    "server_stop": {
        "enabled": True,
        "title": "Serveur arrêté",
        "message": "Le serveur Rust s'est arrêté.",
        "color": 15158332,  # red
    },
    "player_join": {
        "enabled": True,
        "title": "Joueur connecté",
        "message": "**{name}** a rejoint le serveur.",
        "color": 3447003,   # blue
    },
    "player_leave": {
        "enabled": False,
        "title": "Joueur déconnecté",
        "message": "**{name}** a quitté le serveur.",
        "color": 9807270,   # grey
    },
    "wipe": {
        "enabled": True,
        "title": "Wipe effectué",
        "message": "Le serveur vient d'être wipé ! Bonne chance à tous.",
        "color": 10181046,  # purple
    },
    "player_ban": {
        "enabled": True,
        "title": "Joueur banni",
        "message": "**{name}** a été banni du serveur.",
        "color": 15158332,  # red
    },
}

DEFAULT_CONFIG = {
    "webhook_url": "",
    "server_name": "",
    "enabled": True,
    "events": EVENT_DEFAULTS,
}


def load_discord_config() -> dict:
    if DISCORD_CONFIG_PATH.exists():
        with open(DISCORD_CONFIG_PATH) as f:
            saved = json.load(f)
        # Merge events with defaults to add new event types
        merged_events = {**EVENT_DEFAULTS}
        for k, v in saved.get("events", {}).items():
            if k in merged_events:
                merged_events[k] = {**merged_events[k], **v}
        return {**DEFAULT_CONFIG, **saved, "events": merged_events}
    return json.loads(json.dumps(DEFAULT_CONFIG))  # deep copy


def save_discord_config(config: dict) -> None:
    with open(DISCORD_CONFIG_PATH, "w") as f:
        json.dump(config, f, indent=2)


class DiscordNotifier:
    def __init__(self):
        self._config: Optional[dict] = None

    def _get_config(self) -> dict:
        return load_discord_config()

    def _send(self, webhook_url: str, payload: dict) -> tuple[bool, str]:
        try:
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                webhook_url,
                data=data,
                headers={"Content-Type": "application/json", "User-Agent": "RustServerManager/1.0"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                return resp.status in (200, 204), ""
        except urllib.error.HTTPError as e:
            return False, f"HTTP {e.code}: {e.reason}"
        except Exception as exc:
            return False, str(exc)

    def send_event(self, event_key: str, **kwargs) -> None:
        config = self._get_config()
        if not config.get("enabled") or not config.get("webhook_url"):
            return
        event = config.get("events", {}).get(event_key, {})
        if not event.get("enabled"):
            return

        message = event.get("message", "")
        for k, v in kwargs.items():
            message = message.replace(f"{{{k}}}", str(v))

        server_name = config.get("server_name") or "Rust Server"
        payload = {
            "embeds": [{
                "title": event.get("title", event_key),
                "description": message,
                "color": event.get("color", 0),
                "footer": {"text": server_name},
            }]
        }
        self._send(config["webhook_url"], payload)

    def send_test(self, webhook_url: str, server_name: str = "") -> tuple[bool, str]:
        payload = {
            "embeds": [{
                "title": "Test de connexion",
                "description": "Le webhook Discord fonctionne correctement !",
                "color": 3066993,
                "footer": {"text": server_name or "Rust Server Manager"},
            }]
        }
        return self._send(webhook_url, payload)


notifier = DiscordNotifier()
