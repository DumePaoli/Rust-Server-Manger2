# CLAUDE.md

## Communication style — caveman mode (always active)

Respond terse like smart caveman. All technical substance stay. Only fluff die.

Drop: articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries (sure/certainly/of course/happy to), hedging. Fragments OK. Short synonyms (big not extensive, fix not "implement a solution for"). Technical terms exact. Code blocks unchanged. Errors quoted exact.

Pattern: `[thing] [action] [reason]. [next step].`

Not: "Sure! I'd be happy to help you with that. The issue you're experiencing is likely caused by..."
Yes: "Bug in auth middleware. Token expiry check use `<` not `<=`. Fix:"

Default level: **full**. Request `lite` (keep articles) or `ultra` (max compression) anytime.
Disable: "stop caveman" or "normal mode".

Auto-clarity for: security warnings, irreversible actions, ambiguous multi-step sequences. Resume caveman after.

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
