import asyncio
import os
import uuid
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import select, desc

from app.core.config import settings
from app.database.connection import AsyncSessionLocal
from app.downloaders.image_downloader import image_downloader
from app.models.entities import DownloadJob, Batch, DownloadHistory
from app.queue.worker_pool import worker_pool, ws_manager
from app.schemas.media import (
    ImageItemSchema,
    ImageAnalyzeRequest,
    PageDiscoverRequest,
    CreateImageBatchRequest,
    ExportZipRequest,
    BatchResponse,
    JobResponse,
)
from app.services.zip_service import zip_service
from app.utils.security import sanitize_filename, validate_url

router = APIRouter(prefix="/images", tags=["Images"])

@router.post("/analyze", response_model=List[ImageItemSchema])
async def analyze_images(req: ImageAnalyzeRequest):
    """Analyze one or more direct image URLs to extract resolution, dimensions, and original variants."""
    if not req.urls:
        return []

    async def _analyze_single(url: str):
        is_valid, reason = validate_url(url, allow_localhost_for_testing=True)
        if not is_valid:
            return {
                "url": url,
                "resolved_url": url,
                "filename": sanitize_filename(url.split("/")[-1] or "image.jpg"),
                "is_valid": False,
                "error": reason,
                "format": "jpg",
                "mime_type": "image/jpeg",
                "orientation": "Unknown",
                "source": "direct",
                "preview_url": url,
            }
        meta = await image_downloader.analyze_url(url)
        return meta.to_dict()

    # Run up to 10 concurrent analyses
    semaphore = asyncio.Semaphore(10)
    async def _bounded(u: str):
        async with semaphore:
            return await _analyze_single(u)

    tasks = [_bounded(u.strip()) for u in req.urls if u.strip()]
    results = await asyncio.gather(*tasks, return_exceptions=False)
    return results

@router.post("/discover-page", response_model=List[ImageItemSchema])
async def discover_page_images(req: PageDiscoverRequest):
    """Crawl a webpage to discover high-resolution images, srcset entries, and original variants."""
    is_valid, reason = validate_url(req.url, allow_localhost_for_testing=True)
    if not is_valid:
        raise HTTPException(status_code=400, detail=reason)

    metas = await image_downloader.discover_page_images(
        req.url,
        min_width=req.min_width,
        min_height=req.min_height,
        max_images=100
    )
    return [m.to_dict() for m in metas]

@router.post("/batches", response_model=BatchResponse)
async def create_image_batch(req: CreateImageBatchRequest):
    """Queue a batch of images for high-speed concurrent downloading."""
    if not req.items:
        raise HTTPException(status_code=400, detail="No images provided in batch request")

    batch_id = str(uuid.uuid4())
    dest_dir = req.destination_folder or settings.DEFAULT_IMAGES_DESTINATION
    os.makedirs(dest_dir, exist_ok=True)

    # Adjust worker pool image workers and concurrency if requested
    if req.concurrency and 1 <= req.concurrency <= settings.GLOBAL_MAX_WORKERS:
        worker_pool.set_concurrency(req.concurrency)
        worker_pool.image_workers = req.concurrency

    async with AsyncSessionLocal() as session:
        batch = Batch(
            id=batch_id,
            name=req.name,
            total_items=len(req.items),
            completed_items=0,
            failed_items=0,
            skipped_items=0,
            selected_preset=f"image_{req.target_format}",
            destination_folder=dest_dir,
            concurrency=req.concurrency,
            status="QUEUED"
        )
        session.add(batch)

        jobs = []
        for item in req.items:
            resolved_url = item.resolved_url or image_downloader.resolve_original_url(item.url)
            stem_hint = item.title or item.filename or (resolved_url.split("?")[0].split("/")[-1]) or "image"
            clean_title = sanitize_filename(stem_hint)

            job_id = str(uuid.uuid4())
            job = DownloadJob(
                id=job_id,
                batch_id=batch_id,
                source_url=item.url,
                canonical_url=resolved_url,
                title=clean_title,
                thumbnail_url=item.url,
                selected_quality="original",
                selected_format=req.target_format or item.target_format or "original",
                destination_dir=dest_dir,
                media_type="image",
                image_width=item.width,
                image_height=item.height,
                mime_type=item.mime_type,
                image_format=req.target_format or "original",
                source_variant=item.source_variant or "original",
                original_resolution_verified=item.original_verified or False,
                download_engine="httpx_async",
                status="QUEUED"
            )
            session.add(job)
            jobs.append(job)

        await session.commit()
        await session.refresh(batch)

        # Broadcast update
        await ws_manager.broadcast({
            "event": "BATCH_CREATED",
            "batch_id": batch_id,
            "total_items": len(req.items),
            "media_type": "image"
        })

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

@router.post("/export-zip")
async def export_images_zip(req: ExportZipRequest):
    """Package downloaded image files into a single ZIP archive for one-click bulk export."""
    async with AsyncSessionLocal() as session:
        stmt = select(DownloadJob).where(
            DownloadJob.media_type == "image",
            DownloadJob.status == "COMPLETED"
        )
        if req.batch_id:
            stmt = stmt.where(DownloadJob.batch_id == req.batch_id)
        elif req.job_ids:
            stmt = stmt.where(DownloadJob.id.in_(req.job_ids))

        result = await session.execute(stmt)
        jobs = result.scalars().all()

        if not jobs:
            raise HTTPException(status_code=404, detail="No completed image downloads found to export.")

        file_paths = []
        for j in jobs:
            if j.output_path and os.path.isfile(j.output_path):
                file_paths.append(j.output_path)

        if not file_paths:
            raise HTTPException(status_code=404, detail="Downloaded image files do not exist on disk.")

        zip_filename = sanitize_filename(req.zip_name or f"SaveXa_Images_{len(file_paths)}")
        if not zip_filename.endswith(".zip"):
            zip_filename += ".zip"

        export_dir = Path(settings.DEFAULT_IMAGES_DESTINATION) / "Exports"
        export_dir.mkdir(parents=True, exist_ok=True)
        zip_path = export_dir / zip_filename

        final_zip = await zip_service.create_zip_async(file_paths, str(zip_path.resolve()))
        zip_size = os.path.getsize(final_zip)

        return {
            "zip_path": final_zip,
            "filename": zip_filename,
            "file_count": len(file_paths),
            "zip_size": zip_size,
            "message": f"Successfully packaged {len(file_paths)} images into ZIP."
        }

@router.get("/download-zip")
async def download_zip(path: str = Query(...)):
    """Download the created zip file directly through browser."""
    p = Path(path).resolve()
    if not p.is_file():
        raise HTTPException(status_code=404, detail="Exported ZIP file not found.")
    return FileResponse(
        path=str(p),
        filename=p.name,
        media_type="application/zip"
    )
