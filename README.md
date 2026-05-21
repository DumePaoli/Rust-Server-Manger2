# Rust Server Manager

A web-based management panel for Rust dedicated servers.

## Stack
- **Backend**: Python + FastAPI + WebSockets
- **Frontend**: React + Vite + Tailwind CSS

## Features (v1 base)
- Dashboard with server status (CPU, RAM, uptime)
- Start / Stop / Restart server controls
- Live console with WebSocket streaming and command input
- Server Settings (hostname, port, map, gameplay options)
- Plugin Manager UI (Oxide/Carbon — full install coming soon)
- Player Manager UI (RCON integration coming soon)
- Wipe Manager UI (scheduling coming soon)
- Installer page (SteamCMD guide + executable path)

## Quick Start

### Production (React built into backend)
```bash
# Build frontend once
cd frontend && npm install && npm run build && cd ..

# Start backend (serves the built UI)
pip3 install -r backend/requirements.txt
./start.sh
# Open http://localhost:8000
```

### Development (hot reload)
```bash
pip3 install -r backend/requirements.txt
cd frontend && npm install && cd ..
./dev.sh
# Backend: http://localhost:8000
# Frontend: http://localhost:5173
```
