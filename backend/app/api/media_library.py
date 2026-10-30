import mimetypes
import os
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, desc

from app.core.config import settings
from app.database.connection import AsyncSessionLocal
from app.models.entities import DownloadHistory
from app.services.ffmpeg_service import ffmpeg_service

router = APIRouter(prefix="/library", tags=["Media Library"])

class TrimRequest(BaseModel):
    input_path: str
    output_filename: str
    start_time: str
    end_time: str

@router.get("")
async def get_library_items(
    media_type: Optional[str] = Query(None), # video, audio, image
    search: Optional[str] = Query(None)
):
    items = []
    async with AsyncSessionLocal() as session:
        stmt = select(DownloadHistory).order_by(desc(DownloadHistory.completed_at))
        if search:
            stmt = stmt.where(DownloadHistory.title.ilike(f"%{search}%"))
        res = await session.execute(stmt)
        records = res.scalars().all()

        for r in records:
            p = Path(r.output_path)
            exists = p.is_file()
            ext = p.suffix.lower().lstrip(".")
            mime, _ = mimetypes.guess_type(str(p))

            kind = "other"
            if ext in ("mp4", "mkv", "webm", "avi", "mov"):
                kind = "video"
            elif ext in ("mp3", "m4a", "wav", "flac", "opus", "ogg"):
                kind = "audio"
            elif ext in ("jpg", "jpeg", "png", "webp", "gif"):
                kind = "image"

            if media_type and media_type != "all" and kind != media_type:
                continue

            items.append({
                "id": r.id,
                "job_id": r.job_id,
                "title": r.title,
                "output_path": r.output_path,
                "filename": p.name,
                "file_size": p.stat().st_size if exists else r.file_size,
                "format": r.format or ext,
                "quality": r.quality,
                "duration": r.duration,
                "media_type": kind,
                "mime_type": mime,
                "exists_on_disk": exists,
                "completed_at": r.completed_at,
            })

    return items

@router.get("/stream/{history_id}")
async def stream_media(history_id: int):
    async with AsyncSessionLocal() as session:
        entry = await session.get(DownloadHistory, history_id)
        if not entry or not entry.output_path:
            raise HTTPException(status_code=404, detail="Media not found")
        p = Path(entry.output_path)
        if not p.is_file():
            raise HTTPException(status_code=404, detail="File no longer exists on disk")

        mime, _ = mimetypes.guess_type(str(p))
        return FileResponse(
            path=str(p),
            media_type=mime or "application/octet-stream",
            filename=p.name
        )

@router.post("/trim")
async def trim_media_endpoint(req: TrimRequest):
    input_p = Path(req.input_path)
    if not input_p.is_file():
        raise HTTPException(status_code=404, detail="Input file not found")

    out_p = input_p.parent / req.output_filename
    success = await ffmpeg_service.trim_media(
        str(input_p.resolve()),
        str(out_p.resolve()),
        req.start_time,
        req.end_time
    )
    if not success:
        raise HTTPException(status_code=500, detail="FFmpeg trim failed")

    return {
        "status": "success",
        "output_path": str(out_p.resolve()),
        "file_size": out_p.stat().st_size if out_p.exists() else 0
    }

