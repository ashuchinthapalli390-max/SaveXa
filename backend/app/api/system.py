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
from app.services.extractor_health import extractor_health_service
from app.services.extractor_health import extractor_health_service

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
    return extractor_health_service.get_health()
@router.get("/extractor-health", response_model=ExtractorHealthResponse)
async def get_extractor_health():
    """Returns deep diagnostics on yt-dlp environment, JS runtime, cookies, and extractors."""
    return extractor_health_service.get_health()

class ExtractorTestRequest(BaseModel):
    url: Optional[str] = None

@router.post("/extractor-test")
async def test_extractor(req: ExtractorTestRequest):
    """Test extractor connectivity on a public sample."""
    return await extractor_health_service.test_extractor(req.url)


class ExtractorTestRequest(BaseModel):
    url: Optional[str] = None

@router.post("/extractor-test")
async def test_extractor(req: ExtractorTestRequest):
    """Test extractor connectivity on a public sample."""
    return await extractor_health_service.test_extractor(req.url)

