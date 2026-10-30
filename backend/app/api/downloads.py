import uuid
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select, delete, desc

from app.core.config import settings
from app.database.connection import AsyncSessionLocal
from app.models.entities import DownloadJob, DownloadHistory
from app.queue.worker_pool import worker_pool
from app.schemas.media import CreateDownloadRequest, JobResponse
from app.utils.security import sanitize_filename, validate_url

router = APIRouter(prefix="/downloads", tags=["Downloads"])

@router.post("", response_model=JobResponse)
async def create_download(req: CreateDownloadRequest):
    is_valid, reason = validate_url(req.url, allow_localhost_for_testing=True)
    if not is_valid:
        raise HTTPException(status_code=400, detail=reason)

    job_id = str(uuid.uuid4())
    dest_dir = req.destination_folder or settings.DEFAULT_DESTINATION
    title = req.title or sanitize_filename(req.url.split("/")[-1] or "Download")

    async with AsyncSessionLocal() as session:
        job = DownloadJob(
            id=job_id,
            batch_id=req.batch_id,
            source_url=req.url,
            title=title,
            creator=req.creator,
            thumbnail_url=req.thumbnail,
            duration=req.duration,
            selected_quality=req.quality,
            selected_format=req.format,
            audio_bitrate=req.audio_bitrate,
            destination_dir=dest_dir,
            status="QUEUED",
        )
        session.add(job)
        await session.commit()
        await session.refresh(job)
        return JobResponse.model_validate(job)

@router.get("", response_model=List[JobResponse])
async def list_downloads(
    status: Optional[str] = Query(None),
    batch_id: Optional[str] = Query(None),
    limit: int = Query(300, ge=1, le=1000),
):
    async with AsyncSessionLocal() as session:
        stmt = select(DownloadJob)
        if status:
            stmt = stmt.where(DownloadJob.status == status)
        if batch_id:
            stmt = stmt.where(DownloadJob.batch_id == batch_id)
        stmt = stmt.order_by(desc(DownloadJob.created_at)).limit(limit)
        result = await session.execute(stmt)
        jobs = result.scalars().all()
        return [JobResponse.model_validate(j) for j in jobs]

@router.get("/{job_id}", response_model=JobResponse)
async def get_download(job_id: str):
    async with AsyncSessionLocal() as session:
        job = await session.get(DownloadJob, job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        return JobResponse.model_validate(job)

@router.post("/{job_id}/pause")
async def pause_download(job_id: str):
    await worker_pool.pause_job(job_id)
    return {"status": "paused", "job_id": job_id}

@router.post("/{job_id}/resume")
async def resume_download(job_id: str):
    await worker_pool.resume_job(job_id)
    return {"status": "resumed", "job_id": job_id}

@router.post("/{job_id}/cancel")
async def cancel_download(job_id: str):
    await worker_pool.cancel_job(job_id)
    return {"status": "cancelled", "job_id": job_id}

@router.post("/{job_id}/retry")
async def retry_download(job_id: str):
    await worker_pool.retry_job(job_id)
    return {"status": "queued", "job_id": job_id}

@router.delete("/{job_id}")
async def delete_download(job_id: str):
    await worker_pool.cancel_job(job_id)
    async with AsyncSessionLocal() as session:
        job = await session.get(DownloadJob, job_id)
        if job:
            await session.delete(job)
            await session.commit()
    return {"status": "deleted", "job_id": job_id}

@router.post("/clear-completed")
async def clear_completed():
    async with AsyncSessionLocal() as session:
        await session.execute(
            delete(DownloadJob).where(DownloadJob.status.in_(["COMPLETED", "SKIPPED"]))
        )
        await session.commit()
    return {"status": "cleared"}

