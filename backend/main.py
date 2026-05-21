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

manager = ServerManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
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


# ── Serve React build ──────────────────────────────────────────────────────
frontend_build = Path(__file__).parent.parent / "frontend" / "dist"

if frontend_build.exists():
    app.mount("/assets", StaticFiles(directory=frontend_build / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        return FileResponse(frontend_build / "index.html")
