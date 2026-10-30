Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   SaveXa System Dependency Checker     " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$allOk = $true

# Check Python
try {
    $pyVer = python --version 2>&1
    Write-Host "[OK] Python: $pyVer" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] Python is not installed or not in PATH." -ForegroundColor Red
    $allOk = $false
}

# Check Node.js
try {
    $nodeVer = node --version 2>&1
    Write-Host "[OK] Node.js: $nodeVer" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] Node.js is not installed or not in PATH." -ForegroundColor Red
    $allOk = $false
}

# Check Deno (EJS Runtime)
$denoPath = (Get-Command deno -ErrorAction SilentlyContinue).Source
if (-not $denoPath) {
    $wingetDeno = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\DenoLand.Deno_Microsoft.Winget.Source_8wekyb3d8bbwe\deno.exe"
    if (Test-Path $wingetDeno) { $denoPath = $wingetDeno }
}
if ($denoPath) {
    $denoVer = & $denoPath --version | Select-Object -First 1
    Write-Host "[OK] Deno: $denoVer ($denoPath)" -ForegroundColor Green
} else {
    Write-Host "[WARN] Deno not in PATH (Node.js fallback active)." -ForegroundColor Yellow
}

# Check FFmpeg
try {
    $ffmpegVer = ffmpeg -version 2>&1 | Select-Object -First 1
    Write-Host "[OK] FFmpeg: $ffmpegVer" -ForegroundColor Green
} catch {
    Write-Host "[WARN] FFmpeg not in PATH, checking fallback..." -ForegroundColor Yellow
}

# Check yt-dlp-ejs in backend venv
if (Test-Path "backend\.venv\Scripts\python.exe") {
    $ejsCheck = .\backend\.venv\Scripts\python.exe -m pip show yt-dlp-ejs 2>&1 | Select-String "Version:"
    if ($ejsCheck) {
        Write-Host "[OK] yt-dlp-ejs: $($ejsCheck.ToString().Trim())" -ForegroundColor Green
    } else {
        Write-Host "[WARN] yt-dlp-ejs not installed in venv. Run: pip install -U yt-dlp[default]" -ForegroundColor Yellow
    }
}

if ($allOk) {
    Write-Host "`nAll core prerequisites are met!" -ForegroundColor Green
    Exit 0
} else {
    Write-Host "`nPlease install missing dependencies to run SaveXa." -ForegroundColor Red
    Exit 1
}
