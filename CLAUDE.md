# CLAUDE.md

## Communication rules
- No filler phrases ("Sure!", "Great question!", "Happy to help!", "Let me know if you need anything!")
- No restating what was asked before answering
- No summaries at the end unless asked
- Answer directly, concisely
- Code first, explanation after (only if needed)
- One sentence per update during work, not running commentary

## Project: Rust Server Manager

Web-based management panel for Rust dedicated servers.

### Stack
- **Backend**: Python + FastAPI + WebSockets — `backend/`
- **Frontend**: React + Vite + Tailwind CSS — `frontend/`
- Entry point: `backend/main.py`
- Dev: `./dev.sh` (backend :8000, frontend :5173)
- Prod: `./start.sh` (React built into backend, served at :8000)

### Backend modules
| File | Role |
|---|---|
| `main.py` | FastAPI app, routes, WebSocket |
| `server_manager.py` | Start/stop/restart server process |
| `rcon.py` | RCON protocol integration |
| `players.py` | Player list & management |
| `plugins.py` | Oxide/Carbon plugin management |
| `wipe.py` | Wipe scheduling |
| `monitor.py` | CPU/RAM/uptime monitoring |
| `config.py` | Server config read/write |
| `backup.py` | Backup logic |
| `updater.py` | Server update logic |
| `discord_notifier.py` | Discord webhook notifications |
| `chat_log.py` | Chat log handling |
| `bans.py` | Ban management |
| `oxide_perms.py` | Oxide permissions |
| `installer.py` | SteamCMD installer |
| `times.py` | Scheduled tasks |
| `messages.py` | Server messages |
| `version.py` | Version tracking |

### Frontend — `frontend/src/`
React + Vite + Tailwind. Pages map to backend features: Dashboard, Console, Settings, Plugins, Players, Wipe, Installer.

### Dev conventions
- Backend: async FastAPI routes, Pydantic models for validation
- Frontend: functional React components, Tailwind for styling
- WebSockets for live console and server status
- No unnecessary abstraction — keep it direct
