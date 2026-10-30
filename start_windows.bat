@echo off
title SaveXa - Local Universal Media Download Manager
color 0B

echo ========================================================
echo        SaveXa - Universal Media Download Manager
echo         Save Anything. Organize Everything.
echo ========================================================
echo.

:: Check Python venv
if not exist "backend\.venv\Scripts\python.exe" (
    echo [ERROR] Python environment not found. Running setup first...
    powershell -ExecutionPolicy Bypass -File "scripts\setup_windows.ps1"
)

:: Ensure data directories exist
if not exist "data" mkdir data
if not exist "logs" mkdir logs

echo [1/3] Starting SaveXa Backend Engine on http://127.0.0.1:8000 ...
start "SaveXa-Backend" /min cmd /c "set PYTHONPATH=backend&& .\backend\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

echo [2/3] Starting SaveXa Frontend on http://localhost:3000 ...
start "SaveXa-Frontend" /min cmd /c "cd frontend && npm.cmd run dev"

echo [3/3] Waiting for services to initialize...
timeout /t 3 /nobreak >nul

echo.
echo SaveXa is running!
echo Frontend: http://localhost:3000
echo Backend API: http://127.0.0.1:8000/docs
echo.

start http://localhost:3000

echo Press any key to stop all SaveXa services...
pause >nul

echo Stopping SaveXa services...
taskkill /fi "WINDOWTITLE eq SaveXa-Backend*" /t /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq SaveXa-Frontend*" /t /f >nul 2>&1

echo SaveXa services stopped cleanly.
timeout /t 2 /nobreak >nul

