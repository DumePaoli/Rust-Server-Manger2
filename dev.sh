#!/usr/bin/env bash
# Development mode: backend + frontend dev server
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Rust Server Manager [DEV MODE] ==="

# Start backend
echo "[1/2] Starting backend..."
cd "$SCRIPT_DIR/backend"
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Start frontend dev server
echo "[2/2] Starting frontend dev server..."
cd "$SCRIPT_DIR/frontend"
VITE_API_URL=http://localhost:8000 npm run dev &
FRONTEND_PID=$!

echo ""
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM
wait
