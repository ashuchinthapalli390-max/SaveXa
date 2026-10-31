import re
import uuid
from pathlib import Path
from typing import List
from fastapi import APIRouter, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.database.connection import AsyncSessionLocal
from app.models.entities import Batch, DownloadJob, DownloadHistory
from app.queue.worker_pool import worker_pool
from app.schemas.media import CreateBatchRequest, BatchResponse, JobResponse
from app.utils.security import sanitize_filename

router = APIRouter(prefix="/batches", tags=["Batches"])

@router.post("", response_model=BatchResponse)
async def create_batch(req: CreateBatchRequest):
    if not req.items:
        raise HTTPException(status_code=400, detail="Batch contains no items")

    batch_id = str(uuid.uuid4())
    dest_dir = req.destination_folder or settings.DEFAULT_DESTINATION

    # Concurrency setting update if specified
    if req.concurrency and req.concurrency != worker_pool.concurrency:
        worker_pool.set_concurrency(req.concurrency)

    async with AsyncSessionLocal() as session:
        # Check duplicates if enabled
        completed_urls = set()
        existing_video_ids = set()
        if req.skip_duplicates:
            hist_res = await session.execute(select(DownloadHistory.source_url))
            completed_urls = set(hist_res.scalars().all())

            # Check destination directory for already completed media files
            target_path = Path(dest_dir)
            existing_files_map = {}
            if target_path.is_dir():
                for p in target_path.iterdir():
                    if p.is_file() and p.stat().st_size > 1024:
                        m = re.search(r'\[([0-9A-Za-z_-]{11})\]', p.name)
                        if m:
                            v_id = m.group(1)
                            existing_video_ids.add(v_id)
                            existing_files_map[v_id] = p
                        else:
                            m_raw = re.findall(r'([0-9A-Za-z_-]{11})', p.name)
                            if m_raw:
                                v_id = m_raw[-1]
                                existing_video_ids.add(v_id)
                                existing_files_map[v_id] = p

        batch = Batch(
            id=batch_id,
            name=req.name or f"Batch_{uuid.uuid4().hex[:6]}",
            total_items=len(req.items),
            completed_items=0,
            failed_items=0,
            skipped_items=0,
            selected_preset=req.selected_preset,
            destination_folder=dest_dir,
            concurrency=req.concurrency or worker_pool.concurrency,
            status="active" if req.auto_start else "pending",
        )
        session.add(batch)

        jobs = []
        for idx, item in enumerate(req.items):
            m_item = re.search(r'(?:v=|\/)([0-9A-Za-z_-]{11})', item.url)
            vid = m_item.group(1) if m_item else None
            is_dup = req.skip_duplicates and (
                item.url in completed_urls or
                (vid and vid in existing_video_ids)
            )
            job_status = "SKIPPED" if is_dup else ("QUEUED" if req.auto_start else "READY")
            
            existing_file = existing_files_map.get(vid) if vid else None
            out_p = str(existing_file.resolve()) if (is_dup and existing_file) else None
            fn = existing_file.name if (is_dup and existing_file) else None
            sz = existing_file.stat().st_size if (is_dup and existing_file) else 0

            job = DownloadJob(
                id=str(uuid.uuid4()),
                batch_id=batch_id,
                source_url=item.url,
                title=item.title or (existing_file.stem if existing_file else f"Media_{idx+1}"),
                creator=item.creator,
                thumbnail_url=item.thumbnail,
                duration=item.duration,
                selected_quality=item.quality,
                selected_format=item.format,
                audio_bitrate=item.audio_bitrate,
                destination_dir=dest_dir,
                filename=fn,
                output_path=out_p,
                file_size=sz,
                downloaded_bytes=sz,
                progress=100.0 if (is_dup and existing_file) else 0.0,
                status=job_status,
                error_message="Skipped: already downloaded" if is_dup else None,
                queue_position=idx,
            )
            session.add(job)
            jobs.append(job)
            if is_dup:
                batch.skipped_items += 1
                if out_p:
                    history = DownloadHistory(
                        job_id=job.id,
                        media_identifier=vid,
                        media_type="video",
                        title=job.title,
                        thumbnail_url=item.thumbnail,
                        output_path=out_p,
                        file_size=sz,
                        format=existing_file.suffix.lstrip(".") or item.format,
                        quality=item.quality,
                        duration=item.duration,
                        source_url=item.url,
                    )
                    session.add(history)

        await session.commit()
        await session.refresh(batch)

        return BatchResponse(
            id=batch.id,
            name=batch.name,
            total_items=batch.total_items,
            completed_items=batch.completed_items,
            failed_items=batch.failed_items,
            skipped_items=batch.skipped_items,
            selected_preset=batch.selected_preset,
            destination_folder=batch.destination_folder,
            concurrency=batch.concurrency,
            status=batch.status,
            created_at=batch.created_at,
            completed_at=batch.completed_at,
            jobs=[JobResponse.model_validate(j) for j in jobs]
        )

@router.get("", response_model=List[BatchResponse])
async def list_batches():
    async with AsyncSessionLocal() as session:
        stmt = select(Batch).options(selectinload(Batch.jobs)).order_by(desc(Batch.created_at))
        result = await session.execute(stmt)
        batches = result.scalars().all()
        responses = []
        for b in batches:
            if b.jobs:
                completed_c = sum(1 for j in b.jobs if j.status == "COMPLETED")
                failed_c = sum(1 for j in b.jobs if j.status == "FAILED")
                skipped_c = sum(1 for j in b.jobs if j.status == "SKIPPED")
                total_c = len(b.jobs)
                status = b.status
                if (completed_c + failed_c + skipped_c) >= total_c and total_c > 0:
                    status = "completed" if (completed_c + skipped_c) > 0 else "failed"
                responses.append(BatchResponse(
                    id=b.id,
                    name=b.name,
                    total_items=total_c,
                    completed_items=completed_c,
                    failed_items=failed_c,
                    skipped_items=skipped_c,
                    selected_preset=b.selected_preset,
                    destination_folder=b.destination_folder,
                    concurrency=b.concurrency,
                    status=status,
                    created_at=b.created_at,
                    completed_at=b.completed_at,
                    jobs=[JobResponse.model_validate(j) for j in b.jobs]
                ))
            else:
                responses.append(BatchResponse.model_validate(b))
        return responses

@router.get("/{batch_id}", response_model=BatchResponse)
async def get_batch(batch_id: str):
    async with AsyncSessionLocal() as session:
        stmt = select(Batch).options(selectinload(Batch.jobs)).where(Batch.id == batch_id)
        result = await session.execute(stmt)
        batch = result.scalar_one_or_none()
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
        
        completed_c = sum(1 for j in batch.jobs if j.status == "COMPLETED")
        failed_c = sum(1 for j in batch.jobs if j.status == "FAILED")
        skipped_c = sum(1 for j in batch.jobs if j.status == "SKIPPED")
        total_c = len(batch.jobs) if batch.jobs else batch.total_items
        status = batch.status
        if batch.jobs and (completed_c + failed_c + skipped_c) >= total_c and total_c > 0:
            status = "completed" if (completed_c + skipped_c) > 0 else "failed"
            if batch.status != status or batch.completed_items != completed_c:
                batch.status = status
                batch.completed_items = completed_c
                batch.failed_items = failed_c
                batch.skipped_items = skipped_c
                await session.commit()
        
        return BatchResponse(
            id=batch.id,
            name=batch.name,
            total_items=total_c,
            completed_items=completed_c,
            failed_items=failed_c,
            skipped_items=skipped_c,
            selected_preset=batch.selected_preset,
            destination_folder=batch.destination_folder,
            concurrency=batch.concurrency,
            status=status,
            created_at=batch.created_at,
            completed_at=batch.completed_at,
            jobs=[JobResponse.model_validate(j) for j in batch.jobs]
        )

@router.post("/{batch_id}/start")
async def start_batch(batch_id: str):
    async with AsyncSessionLocal() as session:
        batch = await session.get(Batch, batch_id)
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
        batch.status = "active"
        
        # Enqueue READY or PAUSED jobs
        stmt = select(DownloadJob).where(
            DownloadJob.batch_id == batch_id,
            DownloadJob.status.in_(["READY", "PAUSED"])
        )
        jobs = (await session.execute(stmt)).scalars().all()
        for j in jobs:
            j.status = "QUEUED"
        await session.commit()
    return {"status": "started", "batch_id": batch_id}

@router.post("/{batch_id}/pause")
async def pause_batch(batch_id: str):
    async with AsyncSessionLocal() as session:
        batch = await session.get(Batch, batch_id)
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
        batch.status = "paused"
        
        stmt = select(DownloadJob).where(
            DownloadJob.batch_id == batch_id,
            DownloadJob.status.in_(["QUEUED", "DOWNLOADING"])
        )
        jobs = (await session.execute(stmt)).scalars().all()
        for j in jobs:
            await worker_pool.pause_job(j.id)
        await session.commit()
    return {"status": "paused", "batch_id": batch_id}

@router.post("/{batch_id}/cancel")
async def cancel_batch(batch_id: str):
    async with AsyncSessionLocal() as session:
        batch = await session.get(Batch, batch_id)
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
        batch.status = "cancelled"
        
        stmt = select(DownloadJob).where(
            DownloadJob.batch_id == batch_id,
            DownloadJob.status.in_(["QUEUED", "DOWNLOADING", "READY", "PAUSED"])
        )
        jobs = (await session.execute(stmt)).scalars().all()
        for j in jobs:
            await worker_pool.cancel_job(j.id)
        await session.commit()
    return {"status": "cancelled", "batch_id": batch_id}

@router.post("/{batch_id}/retry-failed")
async def retry_failed_batch(batch_id: str):
    async with AsyncSessionLocal() as session:
        batch = await session.get(Batch, batch_id)
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
        batch.status = "active"
        
        stmt = select(DownloadJob).where(
            DownloadJob.batch_id == batch_id,
            DownloadJob.status == "FAILED"
        )
        jobs = (await session.execute(stmt)).scalars().all()
        for j in jobs:
            await worker_pool.retry_job(j.id)
        batch.failed_items = max(0, batch.failed_items - len(jobs))
        await session.commit()
    return {"status": "retrying", "retried_count": len(jobs)}

