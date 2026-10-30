Write-Host "========================================" -ForegroundColor Cyan
Write-Host "         SaveXa Windows Setup           " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. Create Python virtual environment if not present
if (-not (Test-Path "backend\.venv")) {
    Write-Host "`n[1/4] Creating Python virtual environment..." -ForegroundColor Yellow
    python -m venv backend\.venv
} else {
    Write-Host "`n[1/4] Python virtual environment exists." -ForegroundColor Green
}

# 2. Install backend dependencies
Write-Host "`n[2/4] Installing backend dependencies..." -ForegroundColor Yellow
.\backend\.venv\Scripts\python -m pip install --upgrade pip
.\backend\.venv\Scripts\pip install -r backend\requirements.txt

# 3. Install frontend dependencies
Write-Host "`n[3/4] Installing frontend dependencies..." -ForegroundColor Yellow
Set-Location frontend
cmd.exe /c npm.cmd install
Set-Location ..

# 4. Initialize database
Write-Host "`n[4/4] Initializing SQLite persistent database..." -ForegroundColor Yellow
$env:PYTHONPATH = "backend"
.\backend\.venv\Scripts\python -c "import asyncio; from app.database.connection import init_db; asyncio.run(init_db()); print('Database initialized!')"

Write-Host "`n========================================" -ForegroundColor Green
Write-Host " SaveXa Setup Complete! Run start_windows.bat to launch." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

