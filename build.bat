@echo off
echo === Rust Server Manager - Build EXE ===
echo.

REM ── Detect Python 3.11 ───────────────────────────────────────────────────
set PYTHON=
for %%P in (py python3.11 python) do (
    if not defined PYTHON (
        %%P -c "import sys; exit(0 if sys.version_info[:2]==(3,11) else 1)" 2>nul && set PYTHON=%%P
    )
)

REM Try py launcher with explicit version
if not defined PYTHON (
    py -3.11 --version >nul 2>&1 && set PYTHON=py -3.11
)

if not defined PYTHON (
    echo.
    echo ERREUR: Python 3.11 est requis mais introuvable.
    echo.
    echo Telechargez-le ici:
    echo https://www.python.org/downloads/release/python-3119/
    echo.
    echo Lors de l'installation, cochez "Add Python to PATH".
    echo Puis relancez ce script.
    echo.
    pause
    exit /b 1
)

echo Utilisation de Python: %PYTHON%

REM 1. Build React frontend
echo [1/3] Building frontend...
cd frontend
call npm install --silent
call npm run build
cd ..
echo       Done.

REM 2. Install Python dependencies in a virtual environment
echo [2/3] Installing Python dependencies...
%PYTHON% -m venv .venv
call .venv\Scripts\activate.bat
pip install -r backend/requirements.txt -q
pip install pywebview pyinstaller -q
echo       Done.

REM 3. Package with PyInstaller (--onedir = no _MEIPASS temp extraction)
echo [3/3] Packaging app...
pyinstaller ^
  --onedir ^
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

echo Packaging ZIP for distribution...
powershell -Command "Compress-Archive -Path dist\RustServerManager\* -DestinationPath dist\RustServerManager.zip -Force"

echo.
echo =============================================
echo  Build complete!
echo  Dossier: dist\RustServerManager\
echo  ZIP:     dist\RustServerManager.zip
echo  Lancez RustServerManager.exe dans le dossier.
echo =============================================
pause
