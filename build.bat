@echo off
echo === Rust Server Manager - Build EXE ===
echo.

REM 1. Build React frontend
echo [1/3] Building frontend...
cd frontend
call npm install --silent
call npm run build
cd ..
echo       Done.

REM 2. Install Python dependencies
echo [2/3] Installing Python dependencies...
pip install -r backend/requirements.txt -q
pip install pywebview pyinstaller -q
echo       Done.

REM 3. Package with PyInstaller
echo [3/3] Packaging .exe...
pyinstaller ^
  --onefile ^
  --windowed ^
  --name "RustServerManager" ^
  --add-data "backend;backend" ^
  --add-data "frontend/dist;frontend/dist" ^
  --hidden-import uvicorn.logging ^
  --hidden-import uvicorn.loops ^
  --hidden-import uvicorn.loops.auto ^
  --hidden-import uvicorn.protocols ^
  --hidden-import uvicorn.protocols.http ^
  --hidden-import uvicorn.protocols.http.auto ^
  --hidden-import uvicorn.protocols.http.h11_impl ^
  --hidden-import uvicorn.protocols.websockets ^
  --hidden-import uvicorn.protocols.websockets.auto ^
  --hidden-import uvicorn.protocols.websockets.websockets_impl ^
  --hidden-import uvicorn.lifespan ^
  --hidden-import uvicorn.lifespan.on ^
  --hidden-import fastapi ^
  --hidden-import fastapi.middleware.cors ^
  --hidden-import fastapi.staticfiles ^
  --hidden-import fastapi.responses ^
  --hidden-import psutil ^
  --hidden-import aiofiles ^
  --hidden-import websockets ^
  --hidden-import webview ^
  --collect-all uvicorn ^
  --collect-all fastapi ^
  --collect-all webview ^
  launcher.py

echo.
echo =============================================
echo  Build complete!
echo  Fichier: dist\RustServerManager.exe
echo  Double-cliquez pour lancer le logiciel.
echo =============================================
pause
