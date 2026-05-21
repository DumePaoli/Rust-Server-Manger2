#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Rust Server Manager ==="
echo ""

# Start backend
echo "[1/2] Starting backend API..."
cd "$SCRIPT_DIR/backend"
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

echo "      Backend running at http://localhost:8000"
echo ""

# Give backend a moment to start
sleep 1

echo "[2/2] Open your browser at: http://localhost:8000"
echo ""
echo "Press Ctrl+C to stop."
echo ""

wait $BACKEND_PID
