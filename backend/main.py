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
from server_manager import ServerManager
from version import VERSION, GITHUB_REPO
from updater import UpdateChecker, apply_update, get_download_progress
from messages import MessageScheduler, load_messages, save_messages
from wipe import WipeScheduler, load_wipe_data, save_wipe_data, seconds_until_wipe
from discord_notifier import notifier as discord, load_discord_config, save_discord_config
import installer as installer_mod
from times import TimeScheduler, load_tasks, save_tasks, compute_next_run
import plugins as plugins_mod

manager = ServerManager()
update_checker = UpdateChecker(VERSION, GITHUB_REPO)
scheduler = MessageScheduler()
scheduler.set_send_fn(manager.send_command)
wipe_scheduler = WipeScheduler()
wipe_scheduler.set_callbacks(manager.send_command, manager.stop, manager.start)
time_scheduler = TimeScheduler()
time_scheduler.set_callbacks(manager.send_command, manager.stop, manager.start)


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.start()
    wipe_scheduler.start()
    time_scheduler.start()
    yield
    scheduler.stop()
    wipe_scheduler.stop()
    time_scheduler.stop()
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


def broadcast_log(line: str) -> None:
    dead = []
    for ws in active_ws:
        try:
            asyncio.get_event_loop().create_task(ws.send_text(line))
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


@app.post("/api/start")
async def start_server():
    config = load_config()
    ok, msg = await manager.start(config)
    if ok:
        asyncio.get_event_loop().run_in_executor(None, discord.send_event, "server_start")
    return {"success": ok, "message": msg}


@app.post("/api/stop")
async def stop_server():
    ok, msg = await manager.stop()
    if ok:
        asyncio.get_event_loop().run_in_executor(None, discord.send_event, "server_stop")
    return {"success": ok, "message": msg}


@app.post("/api/restart")
async def restart_server():
    config = load_config()
    ok, msg = await manager.restart(config)
    return {"success": ok, "message": msg}


@app.get("/api/config")
async def get_config():
    return load_config()


class ConfigUpdate(BaseModel):
    data: dict


@app.put("/api/config")
async def update_config(body: ConfigUpdate):
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


@app.post("/api/wipe/schedule")
async def set_wipe_schedule(body: WipeScheduleBody):
    data = load_wipe_data()
    data["next_wipe"] = body.next_wipe
    data["wipe_type"] = body.wipe_type
    data["recurrence"] = body.recurrence
    data["warnings"] = body.warnings
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
        await manager.send_command(f"say {body.reason}")
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
