@echo off
:: ============================================================
::  Rust Server - Test de lancement manuel
::  Modifie les variables ci-dessous selon ta config
:: ============================================================

set SERVER_DIR=C:\RustServer
set SERVER_EXE=%SERVER_DIR%\RustDedicated.exe
set SERVER_IDENTITY=rust_server
set SERVER_PORT=28015
set RCON_PORT=28016
set RCON_PASS=changeme
set QUERY_PORT=28017
set MAP_SIZE=3500
set MAP_SEED=12345
set MAX_PLAYERS=50

:: ============================================================

echo ==========================================
echo  Rust Server Manager - Diagnostic Launch
echo ==========================================
echo.

echo [1] Verification du serveur...
if not exist "%SERVER_EXE%" (
    echo ERREUR : RustDedicated.exe introuvable dans %SERVER_DIR%
    echo Verifie le chemin SERVER_DIR dans ce fichier .bat
    pause
    exit /b 1
)
echo OK : %SERVER_EXE%
echo.

echo [2] Dossier de travail : %SERVER_DIR%
cd /d "%SERVER_DIR%"
echo.

echo [3] Lancement du serveur...
echo Parametres :
echo   +server.port %SERVER_PORT%
echo   +server.worldsize %MAP_SIZE%
echo   +server.seed %MAP_SEED%
echo   +server.identity %SERVER_IDENTITY%
echo.
echo La map se genere en 2-5 minutes - attends les lignes "Saving complete" ou "Server startup complete"
echo.

"%SERVER_EXE%" ^
  -batchmode ^
  -nographics ^
  +server.ip 0.0.0.0 ^
  +server.port %SERVER_PORT% ^
  +server.queryport %QUERY_PORT% ^
  +server.maxplayers %MAX_PLAYERS% ^
  +server.hostname "Test Rust Server" ^
  +server.identity %SERVER_IDENTITY% ^
  +server.seed %MAP_SEED% ^
  +server.worldsize %MAP_SIZE% ^
  +server.level "Procedural Map" ^
  +server.saveinterval 600 ^
  +rcon.port %RCON_PORT% ^
  +rcon.password %RCON_PASS% ^
  +rcon.web 1 ^
  -logFile "%SERVER_DIR%\server_output.log"

echo.
echo Serveur arrete (code: %ERRORLEVEL%)
pause
