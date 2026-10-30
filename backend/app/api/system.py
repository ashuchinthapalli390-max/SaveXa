import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func

from app.core.config import settings
from app.database.connection import AsyncSessionLocal
from app.models.entities import DownloadJob
from app.queue.worker_pool import worker_pool
from app.schemas.media import SystemStatusResponse, ExtractorHealthResponse
from app.services.ffmpeg_service import ffmpeg_service
import yt_dlp
import yt_dlp.version

router = APIRouter(prefix="/system", tags=["System"])

class OpenPathRequest(BaseModel):
    path: str

@router.get("/health")
async def health_check():
    return {"status": "ok", "app": settings.PROJECT_NAME, "version": settings.VERSION}

@router.get("/status", response_model=SystemStatusResponse)
async def get_system_status():
    ffmpeg_ok = ffmpeg_service.is_ffmpeg_available()
    ffmpeg_ver = ffmpeg_service.get_ffmpeg_version() if ffmpeg_ok else None
    ffprobe_ok = ffmpeg_service.is_ffprobe_available()

    # Disk usage of default destination drive
    dest_path = Path(settings.DEFAULT_DESTINATION)
    dest_path.mkdir(parents=True, exist_ok=True)
    try:
        usage = shutil.disk_usage(dest_path)
        free_bytes = usage.free
        total_bytes = usage.total
    except Exception:
        free_bytes = 0
        total_bytes = 0

    # Job counts
    async with AsyncSessionLocal() as session:
        active_cnt = (await session.execute(
            select(func.count(DownloadJob.id)).where(DownloadJob.status == "DOWNLOADING")
        )).scalar() or 0

        queued_cnt = (await session.execute(
            select(func.count(DownloadJob.id)).where(DownloadJob.status == "QUEUED")
        )).scalar() or 0

        completed_cnt = (await session.execute(
            select(func.count(DownloadJob.id)).where(DownloadJob.status == "COMPLETED")
        )).scalar() or 0

        failed_cnt = (await session.execute(
            select(func.count(DownloadJob.id)).where(DownloadJob.status == "FAILED")
        )).scalar() or 0

    return SystemStatusResponse(
        app_name=settings.PROJECT_NAME,
        version=settings.VERSION,
        ffmpeg_installed=ffmpeg_ok,
        ffmpeg_version=ffmpeg_ver,
        ffprobe_installed=ffprobe_ok,
        active_downloads=active_cnt,
        queued_downloads=queued_cnt,
        completed_downloads=completed_cnt,
        failed_downloads=failed_cnt,
        concurrency=worker_pool.concurrency,
        default_destination=settings.DEFAULT_DESTINATION,
        storage_free_bytes=free_bytes,
        storage_total_bytes=total_bytes,
    )

@router.post("/open-folder")
async def open_folder(req: OpenPathRequest):
    """Open folder in Windows Explorer or cross-platform."""
    p = Path(req.path)
    folder_to_open = p if p.is_dir() else p.parent
    if not folder_to_open.exists():
        raise HTTPException(status_code=404, detail="Directory not found")

    try:
        if sys.platform == "win32":
            if p.is_file():
                # Highlight file in Windows Explorer
                subprocess.run(f'explorer /select,"{p.resolve()}"', shell=True)
            else:
                os.startfile(folder_to_open)
        elif sys.platform == "darwin":
            subprocess.run(["open", str(folder_to_open)])
        else:
            subprocess.run(["xdg-open", str(folder_to_open)])
        return {"status": "opened", "path": str(folder_to_open)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to open folder: {e}")

@router.post("/open-file")
async def open_file(req: OpenPathRequest):
    """Open downloaded file in default system player."""
    p = Path(req.path)
    if not p.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    try:
        if sys.platform == "win32":
            os.startfile(p)
        elif sys.platform == "darwin":
            subprocess.run(["open", str(p)])
        else:
            subprocess.run(["xdg-open", str(p)])
        return {"status": "opened", "file": str(p)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to open file: {e}")

@router.get("/extractor-health", response_model=ExtractorHealthResponse)
async def get_extractor_health():
    """Returns deep diagnostics on yt-dlp environment, JS runtime, cookies, and extractors."""
    ytdlp_ver = getattr(yt_dlp.version, "__version__", getattr(yt_dlp, "__version__", "2026.10.26"))
    node_path = shutil.which("node")
    node_ver = None
    if node_path:
        try:
            node_ver = subprocess.check_output([node_path, "--version"], text=True, timeout=2).strip()
        except Exception:
            pass

    deno_path = shutil.which("deno")
    deno_ver = None
    if deno_path:
        try:
            deno_ver = subprocess.check_output([deno_path, "--version"], text=True, timeout=2).strip()
        except Exception:
            pass

    ffmpeg_ok = ffmpeg_service.is_ffmpeg_available()
    ffmpeg_ver = ffmpeg_service.get_ffmpeg_version() if ffmpeg_ok else None

    # Detect installed browsers on Windows
    local_app = os.environ.get("LOCALAPPDATA", "")
    app_data = os.environ.get("APPDATA", "")
    browser_checks = {
        "chrome": [
            os.path.join(local_app, "Google", "Chrome", "User Data"),
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        ],
        "edge": [
            os.path.join(local_app, "Microsoft", "Edge", "User Data"),
            "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        ],
        "firefox": [
            os.path.join(app_data, "Mozilla", "Firefox", "Profiles"),
        ],
        "brave": [
            os.path.join(local_app, "BraveSoftware", "Brave-Browser", "User Data"),
        ],
    }
    detected_browsers = []
    for b, paths in browser_checks.items():
        for p in paths:
            if os.path.exists(p):
                detected_browsers.append(b)
                break

    cookies_file = settings.DATA_DIR / "cookies.txt"
    cookies_present = cookies_file.is_file() and cookies_file.stat().st_size > 0

    js_runtime = "none"
    if node_path:
        js_runtime = "node"
    elif deno_path:
        js_runtime = "deno"

    notes = []
    if js_runtime == "node":
        notes.append(f"External JavaScript runtime Node.js ({node_ver}) active for yt-dlp EJS extraction.")
    elif js_runtime == "deno":
        notes.append(f"External JavaScript runtime Deno ({deno_ver}) active.")
    else:
        notes.append("No external JS runtime detected. Install Node.js or Deno for improved extractor compatibility.")

    if ffmpeg_ok:
        notes.append(f"FFmpeg ({ffmpeg_ver}) active for stream merging and high-speed remuxing.")

    if cookies_present:
        notes.append(f"Custom cookies file loaded from {cookies_file.name} for authenticated sources.")
    else:
        notes.append("No cookies.txt file detected in data/. Add data/cookies.txt if automated requests trigger bot challenges.")

    notes.append("Bulk analysis uses polite sequential pacing with automated circuit breaker to prevent IP rate limits.")

    return ExtractorHealthResponse(
        ytdlp_version=ytdlp_ver,
        ytdlp_operational=True,
        js_runtime_configured=js_runtime,
        node_detected=bool(node_path),
        node_version=node_ver,
        node_path=node_path,
        deno_detected=bool(deno_path),
        deno_version=deno_ver,
        ffmpeg_detected=ffmpeg_ok,
        ffmpeg_version=ffmpeg_ver,
        detected_browsers=detected_browsers,
        cookies_file_present=cookies_present,
        cookies_file_path=str(cookies_file) if cookies_present else None,
        recent_access_challenges=0,
        notes=notes,
    )

class ExtractorTestRequest(BaseModel):
    url: Optional[str] = None

@router.post("/extractor-test")
async def test_extractor(req: ExtractorTestRequest):
    """Test extractor connectivity on a public sample."""
    from app.downloaders.ytdlp import YtDlpDownloader
    import time

    test_url = req.url or "https://www.youtube.com/watch?v=aqz-KE-bpKQ" # Big Buck Bunny official trailer
    downloader = YtDlpDownloader()
    start = time.perf_counter()
    meta = await downloader.analyze(test_url)
    elapsed = time.perf_counter() - start

    return {
        "url": test_url,
        "status": meta.analysis_status,
        "is_valid": meta.is_valid,
        "title": meta.title,
        "error_code": meta.error_code,
        "user_message": meta.user_message,
        "latency_ms": round(elapsed * 1000, 2),
    }

