import asyncio
import json
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
from pathlib import Path

from config import load_config, save_config
from server_manager import ServerManager, ServerStatus
from players import PlayerManager
from version import VERSION, GITHUB_REPO
from updater import UpdateChecker, apply_update, get_download_progress
from messages import MessageScheduler, load_messages, save_messages
from wipe import WipeScheduler, load_wipe_data, save_wipe_data, seconds_until_wipe
from discord_notifier import notifier as discord, load_discord_config, save_discord_config
import installer as installer_mod
import prerequisites as prereq_mod
from times import TimeScheduler, load_tasks, save_tasks, compute_next_run
import plugins as plugins_mod
from rcon import rcon_client
from monitor import monitor
import backup as backup_mod
import bans as bans_mod
from chat_log import chat_log
import oxide_perms as oxide_mod
from multi_server import registry
import whitelist as whitelist_mod


class _ManagerProxy:
    """Delegates all calls to the currently active server's manager."""

    def add_log_callback(self, cb):
        registry.add_log_callback(cb)

    @property
    def is_running(self):
        m = registry.get_active_manager()
        return m.is_running if m else False

    @property
    def players(self):
        m = registry.get_active_manager()
        return m.players if m else PlayerManager()

    async def start(self, config=None):
        m = registry.get_active_manager()
        if not m:
            return False, "Aucun serveur actif"
        if config is None:
            active = registry.get_active()
            config = active.config if active else {}
        return await m.start(config)

    async def stop(self):
        m = registry.get_active_manager()
        return await m.stop() if m else (False, "Aucun serveur actif")

    async def restart(self, config=None):
        m = registry.get_active_manager()
        if not m:
            return False, "Aucun serveur actif"
        if config is None:
            active = registry.get_active()
            config = active.config if active else {}
        return await m.restart(config)

    async def send_command(self, cmd):
        m = registry.get_active_manager()
        if m:
            await m.send_command(cmd)  # logs > cmd to console (visual feedback)
        # Route through RCON — stdin is not piped so this is the only real path
        # Auto-reconnect if credentials stored but connection dropped
        if not rcon_client._connected and rcon_client._host and rcon_client._password:
            try:
                await rcon_client.connect(rcon_client._host, rcon_client._port, rcon_client._password)
            except Exception:
                pass
        if rcon_client._connected:
            try:
                await rcon_client.send_command(cmd, timeout=5.0)
            except Exception:
                pass

    def get_status(self):
        m = registry.get_active_manager()
        return m.get_status() if m else ServerStatus()

    def get_console_log(self):
        m = registry.get_active_manager()
        return m.get_console_log() if m else []


manager = _ManagerProxy()
manager.add_log_callback(chat_log.on_log_line)

update_checker = UpdateChecker(VERSION, GITHUB_REPO)
scheduler = MessageScheduler()
scheduler.set_send_fn(manager.send_command)
wipe_scheduler = WipeScheduler()
wipe_scheduler.set_callbacks(manager.send_command, manager.stop, manager.start)
time_scheduler = TimeScheduler()
time_scheduler.set_callbacks(manager.send_command, manager.stop, manager.start)
monitor.set_manager(registry.get_active_manager())
registry.set_on_active_change(monitor.set_manager)


def _on_player_connect(name: str, steamid: str):
    try:
        asyncio.get_event_loop().run_in_executor(None, lambda: discord.send_event("player_join", name=name))
    except Exception:
        pass


def _on_player_disconnect(name: str, steamid: str):
    try:
        asyncio.get_event_loop().run_in_executor(None, lambda: discord.send_event("player_leave", name=name))
    except Exception:
        pass


registry.set_player_callbacks(_on_player_connect, _on_player_disconnect)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _main_loop
    _main_loop = asyncio.get_running_loop()
    scheduler.start()
    wipe_scheduler.start()
    time_scheduler.start()
    monitor.start()
    backup_mod.backup_scheduler.start()
    yield
    scheduler.stop()
    wipe_scheduler.stop()
    time_scheduler.stop()
    monitor.stop()
    backup_mod.backup_scheduler.stop()
    if manager.is_running:
        await manager.stop()


app = FastAPI(title="Rust Server Manager API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── WebSocket console clients ──────────────────────────────────────────────
active_ws: list[WebSocket] = []
_main_loop: Optional[asyncio.AbstractEventLoop] = None


def broadcast_log(line: str) -> None:
    if _main_loop is None or not active_ws:
        return
    dead = []
    for ws in list(active_ws):
        try:
            asyncio.run_coroutine_threadsafe(ws.send_text(line), _main_loop)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in active_ws:
            active_ws.remove(ws)


manager.add_log_callback(broadcast_log)


# ── API routes ─────────────────────────────────────────────────────────────

@app.get("/api/status")
async def get_status():
    status = manager.get_status()
    return status.__dict__


async def _auto_rcon_when_ready(config: dict):
    """Background task: wait for server_ready then auto-connect RCON if configured."""
    if not config.get("rcon_auto_connect"):
        return
    password = config.get("rcon_password", "")
    if not password or password == "changeme":
        return
    host = config.get("server_ip", "127.0.0.1")
    if host in ("0.0.0.0", ""):
        host = "127.0.0.1"
    port = int(config.get("rcon_port", 28016))
    # Poll up to 5 minutes for server_ready
    for _ in range(150):
        await asyncio.sleep(2)
        m = registry.get_active_manager()
        if not m or not m.is_running:
            break
        if m._server_ready:
            if not rcon_client._connected:
                await rcon_client.connect(host, port, password)
            break


@app.post("/api/start")
async def start_server():
    active = registry.get_active()
    config = active.config if active else load_config()
    ok, msg = await manager.start(config)
    if ok:
        asyncio.get_event_loop().run_in_executor(None, discord.send_event, "server_start")
        asyncio.create_task(_auto_rcon_when_ready(config))
    return {"success": ok, "message": msg}


@app.post("/api/stop")
async def stop_server():
    ok, msg = await manager.stop()
    if ok:
        asyncio.get_event_loop().run_in_executor(None, discord.send_event, "server_stop")
    return {"success": ok, "message": msg}


@app.post("/api/restart")
async def restart_server():
    active = registry.get_active()
    config = active.config if active else load_config()
    ok, msg = await manager.restart(config)
    return {"success": ok, "message": msg}


@app.get("/api/config")
async def get_config():
    active = registry.get_active()
    return active.config if active else load_config()


class ConfigUpdate(BaseModel):
    data: dict


@app.put("/api/config")
async def update_config(body: ConfigUpdate):
    active = registry.get_active()
    if active:
        registry.save_config(active.id, body.data)
    else:
        save_config(body.data)
    return {"success": True, "message": "Configuration saved."}


@app.get("/api/console/log")
async def get_console_log():
    return {"lines": manager.get_console_log()}


class CommandBody(BaseModel):
    command: str


@app.post("/api/console/command")
async def send_command(body: CommandBody):
    await manager.send_command(body.command)
    return {"success": True}


@app.websocket("/ws/console")
async def console_ws(ws: WebSocket):
    await ws.accept()
    active_ws.append(ws)
    # Send existing log history on connect
    for line in manager.get_console_log():
        try:
            await ws.send_text(line)
        except Exception:
            break
    try:
        while True:
            await ws.receive_text()  # keep-alive
    except WebSocketDisconnect:
        pass
    finally:
        if ws in active_ws:
            active_ws.remove(ws)


# ── Discord routes ────────────────────────────────────────────────────────

@app.get("/api/discord/config")
async def get_discord_config():
    return load_discord_config()


@app.put("/api/discord/config")
async def update_discord_config(body: ConfigUpdate):
    save_discord_config(body.data)
    return {"success": True}


class TestWebhookBody(BaseModel):
    webhook_url: str
    server_name: str = ""


@app.post("/api/discord/test")
async def test_discord_webhook(body: TestWebhookBody):
    ok, err = discord.send_test(body.webhook_url, body.server_name)
    return {"success": ok, "error": err}


# ── Wipe routes ───────────────────────────────────────────────────────────

@app.get("/api/wipe/status")
async def wipe_status():
    data = load_wipe_data()
    secs = seconds_until_wipe(data.get("next_wipe"))
    return {**data, "seconds_until_wipe": secs}


class WipeScheduleBody(BaseModel):
    next_wipe: Optional[str] = None
    wipe_type: str = "map"
    recurrence: str = "none"
    warnings: list = [30, 10, 5, 1]
    day_warnings: list = [7, 3, 1]


@app.post("/api/wipe/schedule")
async def set_wipe_schedule(body: WipeScheduleBody):
    data = load_wipe_data()
    data["next_wipe"] = body.next_wipe
    data["wipe_type"] = body.wipe_type
    data["recurrence"] = body.recurrence
    data["warnings"] = body.warnings
    data["day_warnings"] = body.day_warnings
    save_wipe_data(data)
    wipe_scheduler._warned.clear()
    return {"success": True}


@app.delete("/api/wipe/schedule")
async def cancel_wipe_schedule():
    data = load_wipe_data()
    data["next_wipe"] = None
    save_wipe_data(data)
    return {"success": True}


class WipeNowBody(BaseModel):
    wipe_type: str = "map"


@app.post("/api/wipe/now")
async def wipe_now(body: WipeNowBody):
    config = load_config()
    data_path = config.get("server_data_path", "")
    if not data_path:
        return {"success": False, "error": "server_data_path non configuré dans Advanced Settings"}

    from wipe import _delete_server_files
    from datetime import datetime, timezone

    if manager.is_running:
        await manager.send_command("say [WIPE] Wipe manuel — le serveur redémarre...")
        await asyncio.sleep(3)
        await manager.stop()
        await asyncio.sleep(3)

    deleted, errors = _delete_server_files(data_path, body.wipe_type)

    wipe_data = load_wipe_data()
    history = wipe_data.get("history", [])
    history.insert(0, {
        "date": datetime.now(timezone.utc).isoformat(),
        "type": body.wipe_type,
        "files_deleted": deleted,
        "errors": errors,
        "manual": True,
    })
    wipe_data["history"] = history[:50]
    save_wipe_data(wipe_data)

    await asyncio.sleep(2)
    await manager.start(config)
    return {"success": True, "files_deleted": deleted, "errors": errors}


# ── Players routes ────────────────────────────────────────────────────────

@app.get("/api/players")
async def get_players():
    return manager.players.get_players()


class PlayerActionBody(BaseModel):
    reason: str = ""


@app.post("/api/players/{steamid}/kick")
async def kick_player(steamid: str, body: PlayerActionBody):
    reason = body.reason or "Kicked by admin"
    await manager.send_command(f"kick {steamid} \"{reason}\"")
    return {"success": True}


@app.post("/api/players/{steamid}/ban")
async def ban_player(steamid: str, body: PlayerActionBody):
    players = manager.players.get_players()
    name = next((p["name"] for p in players if p["steamid"] == steamid), steamid)
    reason = body.reason or "Banned by admin"
    await manager.send_command(f"banid {steamid} \"{name}\" \"{reason}\"")
    asyncio.get_event_loop().run_in_executor(None, lambda: discord.send_event("player_ban", name=name))
    return {"success": True}


@app.post("/api/players/{steamid}/mute")
async def mute_player(steamid: str):
    await manager.send_command(f"mute {steamid}")
    return {"success": True}


@app.post("/api/players/{steamid}/message")
async def message_player(steamid: str, body: PlayerActionBody):
    if body.reason:
        # Carbon pm: pm <steamid> <message> — no quotes
        await manager.send_command(f"pm {steamid} {body.reason}")
    return {"success": True}


# ── Messages routes ───────────────────────────────────────────────────────

@app.get("/api/messages")
async def get_messages():
    return load_messages()


class MessageBody(BaseModel):
    text: str
    interval_minutes: int = 5
    enabled: bool = True
    color: str = ""


@app.post("/api/messages")
async def create_message(body: MessageBody):
    import uuid
    messages = load_messages()
    msg = {
        "id": str(uuid.uuid4()),
        "text": body.text,
        "interval_minutes": body.interval_minutes,
        "enabled": body.enabled,
        "color": body.color,
    }
    messages.append(msg)
    save_messages(messages)
    return msg


@app.put("/api/messages/{mid}")
async def update_message(mid: str, body: MessageBody):
    messages = load_messages()
    for m in messages:
        if m["id"] == mid:
            m["text"] = body.text
            m["interval_minutes"] = body.interval_minutes
            m["enabled"] = body.enabled
            m["color"] = body.color
            save_messages(messages)
            return m
    return {"error": "Not found"}, 404


@app.delete("/api/messages/{mid}")
async def delete_message(mid: str):
    messages = load_messages()
    messages = [m for m in messages if m["id"] != mid]
    save_messages(messages)
    return {"success": True}


@app.post("/api/messages/{mid}/test")
async def test_message(mid: str):
    messages = load_messages()
    for m in messages:
        if m["id"] == mid:
            await manager.send_command(f"say {m['text']}")
            return {"success": True}
    return {"success": False, "error": "Not found"}


# ── Update routes ─────────────────────────────────────────────────────────

@app.get("/api/update/check")
async def check_update(force: bool = False):
    return update_checker.check(force=force)


@app.get("/api/update/progress")
async def update_progress():
    return get_download_progress()


@app.post("/api/update/apply")
async def apply_update_route():
    info = update_checker.check()
    if not info.get("available"):
        return {"success": False, "message": "Aucune mise à jour disponible."}
    url = info.get("download_url")
    if not url:
        return {"success": False, "message": "URL de téléchargement introuvable dans la release GitHub."}
    import asyncio
    asyncio.get_event_loop().run_in_executor(None, apply_update, url)
    return {"success": True, "message": "Téléchargement en cours…"}


# ── Plugins routes ───────────────────────────────────────────────────────

@app.get("/api/plugins/installed")
async def get_installed_plugins():
    return plugins_mod.list_installed(load_config())


@app.get("/api/plugins/search")
async def search_plugins(q: str = "", page: int = 1):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, plugins_mod.search_umod, q, page)


class InstallPluginBody(BaseModel):
    download_url: str
    name: str


@app.post("/api/plugins/install")
async def install_plugin(body: InstallPluginBody):
    loop = asyncio.get_event_loop()
    ok, msg = await loop.run_in_executor(None, plugins_mod.install_plugin, load_config(), body.download_url, body.name)
    return {"success": ok, "message": msg}


@app.delete("/api/plugins/{name}")
async def remove_plugin(name: str):
    ok, msg = plugins_mod.remove_plugin(load_config(), name)
    return {"success": ok, "message": msg}


@app.post("/api/plugins/{name}/reload")
async def reload_plugin(name: str):
    await manager.send_command(f"oxide.reload {name}")
    return {"success": True}


# ── Times routes ─────────────────────────────────────────────────────────

@app.get("/api/times")
async def get_times():
    return load_tasks()


class TaskBody(BaseModel):
    name: str
    type: str = "restart"
    command: str = ""
    schedule_type: str = "daily"
    time: str = "04:00"
    day: str = "monday"
    interval_hours: int = 6
    warn_minutes: list = [15, 5, 1]
    enabled: bool = True


@app.post("/api/times")
async def create_task(body: TaskBody):
    import uuid as _uuid
    tasks = load_tasks()
    task = {
        "id": str(_uuid.uuid4()),
        "name": body.name,
        "type": body.type,
        "command": body.command,
        "schedule_type": body.schedule_type,
        "time": body.time,
        "day": body.day,
        "interval_hours": body.interval_hours,
        "warn_minutes": body.warn_minutes,
        "enabled": body.enabled,
        "last_run": None,
        "next_run": None,
    }
    task["next_run"] = compute_next_run(task)
    tasks.append(task)
    save_tasks(tasks)
    return task


@app.put("/api/times/{tid}")
async def update_task(tid: str, body: TaskBody):
    tasks = load_tasks()
    for t in tasks:
        if t["id"] == tid:
            t.update({
                "name": body.name,
                "type": body.type,
                "command": body.command,
                "schedule_type": body.schedule_type,
                "time": body.time,
                "day": body.day,
                "interval_hours": body.interval_hours,
                "warn_minutes": body.warn_minutes,
                "enabled": body.enabled,
            })
            t["next_run"] = compute_next_run(t)
            save_tasks(tasks)
            return t
    return {"error": "Not found"}


@app.delete("/api/times/{tid}")
async def delete_task(tid: str):
    tasks = [t for t in load_tasks() if t["id"] != tid]
    save_tasks(tasks)
    return {"success": True}


@app.post("/api/times/{tid}/toggle")
async def toggle_task(tid: str):
    tasks = load_tasks()
    for t in tasks:
        if t["id"] == tid:
            t["enabled"] = not t.get("enabled", True)
            if t["enabled"]:
                t["next_run"] = compute_next_run(t)
            save_tasks(tasks)
            return t
    return {"error": "Not found"}


# ── Installer routes ──────────────────────────────────────────────────────

@app.get("/api/installer/status")
async def installer_status():
    return installer_mod.get_status()


@app.get("/api/installer/progress")
async def installer_progress():
    return installer_mod.get_progress()


class DownloadSteamCMDBody(BaseModel):
    install_dir: str


@app.post("/api/installer/steamcmd/download")
async def download_steamcmd(body: DownloadSteamCMDBody):
    installer_mod.start_download_steamcmd(body.install_dir)
    return {"success": True, "message": "Téléchargement démarré…"}


class InstallServerBody(BaseModel):
    steamcmd_path: str
    server_dir: str


@app.post("/api/installer/server/install")
async def install_server(body: InstallServerBody):
    installer_mod.start_install_server(body.steamcmd_path, body.server_dir)
    return {"success": True, "message": "Installation démarrée…"}


# ── Prerequisites routes ──────────────────────────────────────────────────

@app.get("/api/prerequisites")
async def get_prerequisites():
    # check_all() runs subprocess (dotnet check) — must not block event loop
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(None, prereq_mod.check_all)
    return result

@app.get("/api/prerequisites/progress")
async def get_prereq_progress():
    return prereq_mod.get_progress()

@app.post("/api/prerequisites/{pid}/install")
async def install_prereq(pid: str):
    ok = prereq_mod.install(pid)
    if not ok:
        return {"success": False, "message": "Prérequis inconnu ou non installable."}
    return {"success": True, "message": f"Installation de {pid} démarrée…"}


# ── Bans routes ──────────────────────────────────────────────────────────

@app.get("/api/bans")
async def get_bans():
    return bans_mod.list_bans(load_config())


class BanBody(BaseModel):
    steamid: str
    name: str = ""
    reason: str = ""


@app.post("/api/bans")
async def add_ban(body: BanBody):
    cmd = f'banid {body.steamid} "{body.name}" "{body.reason}"'
    await manager.send_command(cmd)
    return {"success": True, "message": f"{body.steamid} banni."}


@app.delete("/api/bans/{steamid}")
async def remove_ban(steamid: str):
    await manager.send_command(f"removeid {steamid}")
    return {"success": True, "message": f"{steamid} débanni."}


# ── Chat log routes ───────────────────────────────────────────────────────

@app.get("/api/chat/log")
async def get_chat_log(search: str = "", limit: int = 200):
    return chat_log.get_lines(search=search, limit=limit)


@app.delete("/api/chat/log")
async def clear_chat_log():
    chat_log.clear()
    return {"success": True}


# ── Oxide permissions routes ──────────────────────────────────────────────

@app.get("/api/oxide/groups")
async def get_oxide_groups():
    return oxide_mod.get_groups(load_config())


@app.get("/api/oxide/users")
async def get_oxide_users():
    return oxide_mod.get_users(load_config())


class OxideCmdBody(BaseModel):
    command: str  # e.g. "oxide.addgroup 76561198... default"


@app.post("/api/oxide/cmd")
async def oxide_cmd(body: OxideCmdBody):
    await manager.send_command(body.command)
    return {"success": True}


# ── Monitor routes ────────────────────────────────────────────────────────

@app.get("/api/monitor/metrics")
async def get_metrics(minutes: int = 15):
    return monitor.get_metrics(minutes)


# ── Backup routes ─────────────────────────────────────────────────────────

@app.get("/api/backup/config")
async def get_backup_config():
    return backup_mod.load_backup_config()


@app.put("/api/backup/config")
async def update_backup_config(body: ConfigUpdate):
    backup_mod.save_backup_config(body.data)
    return {"success": True}


@app.get("/api/backup/list")
async def list_backups():
    cfg = backup_mod.load_backup_config()
    return backup_mod.list_backups(cfg.get("backup_dir", ""))


@app.get("/api/backup/progress")
async def backup_progress():
    return backup_mod.get_progress()


@app.post("/api/backup/now")
async def backup_now():
    cfg = backup_mod.load_backup_config()
    data_path = load_config().get("server_data_path", "").strip()
    if not data_path:
        return {"success": False, "message": "server_data_path non configuré"}
    loop = asyncio.get_event_loop()
    ok, msg = await loop.run_in_executor(
        None, backup_mod.do_backup, data_path, cfg["backup_dir"], cfg["keep_last"]
    )
    if ok:
        cfg["last_backup"] = __import__("time").time()
        backup_mod.save_backup_config(cfg)
    return {"success": ok, "message": msg}


@app.delete("/api/backup/{filename}")
async def delete_backup(filename: str):
    cfg = backup_mod.load_backup_config()
    ok, msg = backup_mod.delete_backup(cfg.get("backup_dir", ""), filename)
    return {"success": ok, "message": msg}


# ── RCON routes ──────────────────────────────────────────────────────────

@app.get("/api/rcon/status")
async def rcon_status():
    return rcon_client.get_status()


class RconConnectBody(BaseModel):
    host: str
    port: int
    password: str


@app.post("/api/rcon/connect")
async def rcon_connect(body: RconConnectBody):
    ok, msg = await rcon_client.connect(body.host, body.port, body.password)
    return {"success": ok, "message": msg}


@app.post("/api/rcon/disconnect")
async def rcon_disconnect():
    await rcon_client.disconnect()
    return {"success": True}


class RconCommandBody(BaseModel):
    command: str


@app.post("/api/rcon/command")
async def rcon_command(body: RconCommandBody):
    ok, response = await rcon_client.send_command(body.command)
    return {"success": ok, "response": response}


@app.get("/api/rcon/history")
async def rcon_history():
    return rcon_client.get_history()


@app.delete("/api/rcon/history")
async def rcon_clear_history():
    rcon_client.clear_history()
    return {"success": True}


# ── Servers routes ───────────────────────────────────────────────────────

@app.get("/api/servers")
async def list_servers_route():
    return {"servers": registry.list_servers()}


class ServerCreateBody(BaseModel):
    name: str
    config: dict = {}


@app.post("/api/servers")
async def create_server(body: ServerCreateBody):
    e = registry.add_server(body.name, body.config)
    return {"success": True, "id": e.id, "name": e.name}


class ServerUpdateBody(BaseModel):
    name: str
    config: dict = {}


@app.put("/api/servers/{server_id}")
async def update_server_route(server_id: str, body: ServerUpdateBody):
    ok = registry.update_server(server_id, body.name, body.config)
    return {"success": ok}


@app.delete("/api/servers/{server_id}")
async def delete_server_route(server_id: str):
    ok, msg = registry.delete_server(server_id)
    return {"success": ok, "message": msg}


@app.post("/api/servers/{server_id}/select")
async def select_server(server_id: str):
    ok = registry.set_active(server_id)
    return {"success": ok}


@app.get("/api/servers/{server_id}/config")
async def get_server_config(server_id: str):
    cfg = registry.get_config(server_id)
    if cfg is None:
        return {"error": "Not found"}
    return cfg


@app.put("/api/servers/{server_id}/config")
async def update_server_config(server_id: str, body: ConfigUpdate):
    ok = registry.save_config(server_id, body.data)
    return {"success": ok}


# ── Map routes ────────────────────────────────────────────────────────────

def _find_map_image(config: dict) -> Optional[Path]:
    data_path = config.get("server_data_path", "").strip()
    identity = config.get("server_identity", "rust_server")
    if not data_path:
        return None
    root = Path(data_path)
    for sub in [root / identity / "maps", root / "maps", root]:
        for ext in ["*.jpg", "*.png"]:
            matches = list(sub.glob(ext)) if sub.exists() else []
            if matches:
                return matches[0]
    return None


@app.get("/api/map/info")
async def get_map_info():
    active = registry.get_active()
    config = active.config if active else load_config()
    seed = config.get("map_seed", 0)
    size = config.get("map_size", 3500)
    level = config.get("level", "Procedural Map")
    has_img = _find_map_image(config) is not None
    rustmaps_url = f"https://rustmaps.com/map/{size}/{seed}" if "Procedural" in str(level) else None
    return {
        "seed": seed,
        "size": size,
        "level": level,
        "rustmaps_url": rustmaps_url,
        "has_local_image": has_img,
    }


@app.get("/api/map/image")
async def get_map_image():
    active = registry.get_active()
    config = active.config if active else load_config()
    img = _find_map_image(config)
    if not img:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Aucune image de carte trouvée")
    return FileResponse(str(img))


# ── Whitelist routes ─────────────────────────────────────────────────────

@app.get("/api/whitelist")
async def get_whitelist():
    active = registry.get_active()
    config = active.config if active else load_config()
    return whitelist_mod.list_whitelist(config)


class WhitelistAddBody(BaseModel):
    steamid: str
    name: str = ""


@app.post("/api/whitelist")
async def add_whitelist(body: WhitelistAddBody):
    active = registry.get_active()
    config = active.config if active else load_config()
    if manager.is_running:
        await manager.send_command(f"whitelist.add {body.steamid}")
    ok, msg = whitelist_mod.add_entry(config, body.steamid, body.name or body.steamid)
    return {"success": ok, "message": msg}


@app.delete("/api/whitelist/{steamid}")
async def remove_whitelist(steamid: str):
    active = registry.get_active()
    config = active.config if active else load_config()
    if manager.is_running:
        await manager.send_command(f"whitelist.remove {steamid}")
    ok, msg = whitelist_mod.remove_entry(config, steamid)
    return {"success": ok, "message": msg}


@app.post("/api/whitelist/toggle")
async def toggle_whitelist():
    active = registry.get_active()
    config = active.config if active else load_config()
    new_val = not config.get("whitelist_enabled", False)
    if manager.is_running:
        await manager.send_command(f"server.whitelist {str(new_val).lower()}")
    config["whitelist_enabled"] = new_val
    if active:
        registry.save_config(active.id, config)
    return {"success": True, "enabled": new_val}


# ── Plugin update routes ──────────────────────────────────────────────────

@app.get("/api/plugins/updates")
async def check_plugin_updates():
    loop = asyncio.get_event_loop()
    active = registry.get_active()
    config = active.config if active else load_config()
    updates = await loop.run_in_executor(None, plugins_mod.check_updates, config)
    return {"updates": updates}


@app.post("/api/plugins/{name}/update")
async def update_plugin(name: str):
    loop = asyncio.get_event_loop()
    active = registry.get_active()
    config = active.config if active else load_config()
    info = await loop.run_in_executor(None, plugins_mod._get_umod_plugin_info, name)
    if not info:
        return {"success": False, "message": f"Plugin '{name}' introuvable sur uMod"}
    download_url = info.get("download_url") or f"https://umod.org/plugins/{name}.cs"
    ok, msg = await loop.run_in_executor(None, plugins_mod.install_plugin, config, download_url, name)
    if ok and manager.is_running:
        await manager.send_command(f"oxide.reload {name}")
    return {"success": ok, "message": msg}


# ── Frameworks (Carbon / Oxide) ────────────────────────────────────────────

@app.get("/api/frameworks")
async def get_frameworks():
    loop = asyncio.get_event_loop()
    active = registry.get_active()
    config = active.config if active else load_config()
    status = await loop.run_in_executor(None, plugins_mod.get_framework_status, config)
    return status


@app.post("/api/frameworks/{name}/install")
async def install_framework_route(name: str):
    if name not in ("carbon", "oxide"):
        raise HTTPException(status_code=400, detail="Framework inconnu")
    loop = asyncio.get_event_loop()
    active = registry.get_active()
    config = active.config if active else load_config()
    ok, msg = await loop.run_in_executor(None, plugins_mod.install_framework, config, name)
    return {"success": ok, "message": msg}


# ── Folder browser (desktop only) ─────────────────────────────────────────

@app.get("/api/browse-folder")
async def browse_folder():
    try:
        import webview
        if webview.windows:
            result = webview.windows[0].create_file_dialog(webview.FOLDER_DIALOG)
            if result:
                return {"path": result[0]}
    except Exception:
        pass
    return {"path": None}


# ── Serve React build ──────────────────────────────────────────────────────
def _frontend_dist() -> Path:
    import sys
    if getattr(sys, "frozen", False):
        # PyInstaller bundle: files are in sys._MEIPASS
        return Path(sys._MEIPASS) / "frontend" / "dist"
    return Path(__file__).parent.parent / "frontend" / "dist"

frontend_build = _frontend_dist()

if frontend_build.exists():
    app.mount("/assets", StaticFiles(directory=frontend_build / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        return FileResponse(frontend_build / "index.html")
