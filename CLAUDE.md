# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Approach
- Read existing files before writing. Don't re-read unless changed.
- Thorough in reasoning, concise in output.
- Skip files over 100KB unless required.
- No sycophantic openers or closing fluff.
- No emojis or em-dashes.
- Do not guess APIs, versions, flags, commit SHAs, or package names. Verify by reading code or docs before asserting.

## Commands

### Development (hot reload)
```bash
./dev.sh
# Backend: http://localhost:8000  Frontend: http://localhost:5173
```

### Production (backend serves built frontend)
```bash
cd frontend && npm install && npm run build && cd ..
pip install -r backend/requirements.txt
./start.sh
```

### Frontend only
```bash
cd frontend
npm install
npm run dev        # dev server
npm run build      # production build
npm run lint       # ESLint
```

### Build desktop .exe (Windows, requires Python 3.11)
```bash
build.bat
```

## Architecture

This is a **native desktop app** (PyWebView + PyInstaller `.exe`) composed of:

- **`launcher.py`** — entry point. Starts uvicorn in a background daemon thread, waits for it to be ready, then opens a PyWebView window pointing at `http://localhost:{port}`. Also watches for a `.shutdown_signal` file (written by the self-update flow) to gracefully close the window.
- **`backend/`** — FastAPI app (`main.py`). All Python modules are imported at startup and wired together.
- **`frontend/`** — React 19 + Vite + Tailwind CSS v3 SPA. In production the built `dist/` is served by FastAPI's `StaticFiles`.

### Config & data persistence
All runtime data lives in `%APPDATA%\RustServerManager\` (Windows) or `~/.rustservermanager/` (Linux), set via the `RSM_CONFIG_DIR` env var. Key files:
- `server_config.json` — legacy single-server config (read by `config.py`)
- `servers.json` — multi-server registry (managed by `multi_server.py`)
- `wipe_data.json`, `messages.json`, `tasks.json`, `discord_config.json`, `backup_config.json`

### Multi-server pattern
`backend/multi_server.py` exports a singleton `registry: ServerRegistry`. Each server entry wraps its own `ServerManager` instance. `main.py` uses `_ManagerProxy` — a thin delegator that forwards all calls to `registry.get_active_manager()`. All existing API routes work unchanged; `registry.get_active()` replaces direct `load_config()` calls where per-server config is needed.

### Backend module responsibilities
| Module | Purpose |
|--------|---------|
| `server_manager.py` | Subprocess lifecycle (start/stop/restart), log streaming, `PlayerManager`, auto-restart on crash |
| `players.py` | Parses connect/disconnect patterns from log lines; fires `on_connect`/`on_disconnect` callbacks |
| `rcon.py` | Async WebSocket RCON client (`ws://host:port/password`); `asyncio.Future`-based dispatch |
| `monitor.py` | Polls `psutil` every 5 s; keeps 720-point ring buffer (1 h) of CPU/RAM/player metrics |
| `wipe.py` | `WipeScheduler` asyncio task; day-level + minute-level in-game warnings; file deletion + recurrence |
| `backup.py` | ZIP backups of `.sav`/`.map`/oxide data; rotation; `BackupScheduler` |
| `discord_notifier.py` | Sync HTTP webhook calls; event templates with `{name}` placeholders |
| `multi_server.py` | `ServerRegistry` — CRUD for server profiles, active-server switching, callback propagation |
| `plugins.py` | Lists installed `.cs`/`.js` plugins; searches uMod API; installs/removes; checks for updates |
| `whitelist.py` | Reads/writes `cfg/users.cfg`; parses `add <steamid> "<name>"` lines |
| `bans.py` | Reads `cfg/bans.cfg` |
| `chat_log.py` | Regex-based chat extraction from console log lines |
| `oxide_perms.py` | Parses `oxide/data/oxide.groups.data` and `oxide/data/oxide.users.data` |

### Frontend structure
- `src/api/client.js` — axios wrapper; all pages import from here for core server actions. Other pages call `axios` directly with `BASE = import.meta.env.VITE_API_URL || "http://localhost:8000"`.
- `src/contexts/SettingsContext.jsx` — theme (6 palettes) + language (fr/en). Theme is applied by writing CSS variables (`--accent-50` … `--accent-900`) on `:root`. Persisted in `localStorage`.
- `src/i18n.js` — simple `t(key, lang)` helper; FR translations only, EN returns the key.
- `src/components/Sidebar.jsx` — navigation + server switcher dropdown (polls `/api/servers` every 15 s).
- Pages in `src/pages/` map 1-to-1 with backend feature modules.

### Theming / styling conventions
- `rust-*` Tailwind colors map to `--accent-*` CSS variables → runtime-switchable theme.
- `surface-{900..400}` = fixed dark background scale.
- Reusable component classes in `index.css`: `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.card`, `.input`, `.label`, `.badge-online`, `.badge-offline`.

### Self-update flow
`updater.py` downloads a `.exe.update` file, writes `.shutdown_signal`, then a PowerShell script waits for the process to exit, deletes the old `_MEIPASS` PyInstaller extraction folder (prevents DLL reuse errors), moves `.exe.update` → `.exe`, and relaunches.

### Key conventions
- All development is on branch `claude/rust-server-manager-rdBaL`; never push directly to `main`.
- Responses/UI text are in **French**.
- New backend features follow the pattern: module file → import in `main.py` → routes added before `# ── Serve React build`.
- New pages: create `src/pages/XxxPage.jsx` → add route in `App.jsx` → add nav entry in `Sidebar.jsx` → add translation in `i18n.js`.
