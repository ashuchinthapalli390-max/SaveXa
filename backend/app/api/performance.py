import time
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func

from app.core.config import settings
from app.database.connection import AsyncSessionLocal
from app.models.entities import DownloadJob
from app.queue.worker_pool import worker_pool
from app.schemas.media import PerformanceSettingsSchema, PerformanceStatusResponse

router = APIRouter(prefix="/performance", tags=["Performance"])

class UpdatePerformanceSettingsRequest(BaseModel):
    mode: Optional[str] = None # stable, balanced, fast, maximum, custom
    concurrency: Optional[int] = None
    image_workers: Optional[int] = None
    video_workers: Optional[int] = None
    per_host_limit: Optional[int] = None
    speed_limit_kbps: Optional[int] = None

@router.get("/settings", response_model=PerformanceSettingsSchema)
async def get_performance_settings():
    return PerformanceSettingsSchema(
        mode=worker_pool.download_mode,
        global_max_workers=worker_pool.global_max_workers,
        concurrency=worker_pool.concurrency,
        image_workers=worker_pool.image_workers,
        video_workers=worker_pool.video_workers,
        per_host_limit=worker_pool.per_host_limit,
        speed_limit_kbps=worker_pool.speed_limit,
    )

@router.patch("/settings", response_model=PerformanceSettingsSchema)
async def update_performance_settings(req: UpdatePerformanceSettingsRequest):
    if req.mode:
        worker_pool.set_performance_mode(req.mode)
    if req.concurrency is not None:
        worker_pool.set_concurrency(req.concurrency)
    if req.image_workers is not None:
        worker_pool.image_workers = max(1, min(settings.GLOBAL_MAX_WORKERS, req.image_workers))
    if req.video_workers is not None:
        worker_pool.video_workers = max(1, min(settings.GLOBAL_MAX_WORKERS, req.video_workers))
    if req.per_host_limit is not None:
        worker_pool.per_host_limit = max(1, min(10, req.per_host_limit))
        worker_pool.image_downloader.per_host_limit = worker_pool.per_host_limit
    if req.speed_limit_kbps is not None:
        worker_pool.speed_limit = max(0, req.speed_limit_kbps)

    return await get_performance_settings()

@router.get("/status", response_model=PerformanceStatusResponse)
async def get_performance_status():
    total_speed = sum(worker_pool._active_speeds.values())
    speed_mbps = (total_speed * 8) / 1_000_000
    speed_mbs = total_speed / (1024 * 1024)

    active_videos = sum(1 for t in worker_pool._job_media_types.values() if t == "video")
    active_images = sum(1 for t in worker_pool._job_media_types.values() if t == "image")

    formatted = f"{speed_mbs:.2f} MB/s ({speed_mbps:.1f} Mbps)"

    async with AsyncSessionLocal() as session:
        queued_count = await session.scalar(
            select(func.count(DownloadJob.id)).where(DownloadJob.status == "QUEUED")
        ) or 0
        completed_count = await session.scalar(
            select(func.count(DownloadJob.id)).where(DownloadJob.status == "COMPLETED")
        ) or 0
        failed_count = await session.scalar(
            select(func.count(DownloadJob.id)).where(DownloadJob.status == "FAILED")
        ) or 0

    return PerformanceStatusResponse(
        mode=worker_pool.download_mode,
        concurrency=worker_pool.concurrency,
        global_max_workers=worker_pool.global_max_workers,
        active_workers=len(worker_pool.active_tasks),
        active_images=active_images,
        active_videos=active_videos,
        speed_bytes_sec=round(total_speed, 2),
        speed_mbs=round(speed_mbs, 2),
        speed_mbps=round(speed_mbps, 2),
        formatted_speed=formatted,
        queued_jobs=queued_count,
        completed_jobs=completed_count,
        failed_jobs=failed_count,
    )

@router.get("/diagnostics")
async def get_diagnostics():
    total_speed = sum(worker_pool._active_speeds.values())
    speed_mbps = (total_speed * 8) / 1_000_000
    speed_mbs = total_speed / (1024 * 1024)

    bottlenecks = []
    if len(worker_pool.active_tasks) == 0:
        bottlenecks.append("Idle: No active downloads in flight.")
    elif speed_mbps < 5.0 and len(worker_pool.active_tasks) > 5:
        bottlenecks.append("Per-host rate limiting or remote server bandwidth throttling detected.")

    return {
        "engine": "SaveXa High-Speed V2 (Multi-worker Concurrency)",
        "concurrency": worker_pool.concurrency,
        "max_workers": worker_pool.global_max_workers,
        "active_workers": len(worker_pool.active_tasks),
        "target_throughput": "50 Mbps (~6.25 MB/s)",
        "current_throughput_mbps": round(speed_mbps, 2),
        "current_throughput_mbs": round(speed_mbs, 2),
        "rolling_history_points": len(worker_pool._speed_history),
        "identified_bottlenecks": bottlenecks,
        "per_host_semaphores_active": len(worker_pool.image_downloader._host_semaphores),
    }

