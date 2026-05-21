import asyncio
import json
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pathlib import Path

from config import load_config, save_config
from server_manager import ServerManager
from version import VERSION, GITHUB_REPO
from updater import UpdateChecker, apply_update, get_download_progress
from messages import MessageScheduler, load_messages, save_messages

manager = ServerManager()
update_checker = UpdateChecker(VERSION, GITHUB_REPO)
scheduler = MessageScheduler()
scheduler.set_send_fn(manager.send_command)


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.start()
    yield
    scheduler.stop()
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
    return {"success": ok, "message": msg}


@app.post("/api/stop")
async def stop_server():
    ok, msg = await manager.stop()
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
