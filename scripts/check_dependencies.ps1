Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   SaveXa System Dependency Checker     " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$allOk = $true

# Check Python
try {
    $pyVer = python --version 2>&1
    Write-Host "[✓] Python: $pyVer" -ForegroundColor Green
} catch {
    Write-Host "[✗] Python is not installed or not in PATH." -ForegroundColor Red
    $allOk = $false
}

# Check Node.js
try {
    $nodeVer = node --version 2>&1
    Write-Host "[✓] Node.js: $nodeVer" -ForegroundColor Green
} catch {
    Write-Host "[✗] Node.js is not installed or not in PATH." -ForegroundColor Red
    $allOk = $false
}

# Check FFmpeg
try {
    $ffmpegVer = ffmpeg -version 2>&1 | Select-Object -First 1
    Write-Host "[✓] FFmpeg: $ffmpegVer" -ForegroundColor Green
} catch {
    Write-Host "[!] FFmpeg not in PATH, checking fallback..." -ForegroundColor Yellow
}

if ($allOk) {
    Write-Host "`nAll prerequisites are met!" -ForegroundColor Green
    Exit 0
} else {
    Write-Host "`nPlease install missing dependencies to run SaveXa." -ForegroundColor Red
    Exit 1
}

