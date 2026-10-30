import json
import os
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.core.config import settings
from app.database.connection import AsyncSessionLocal
from app.models.entities import Setting, utcnow
from app.queue.worker_pool import worker_pool
from app.schemas.media import SettingsUpdateRequest

router = APIRouter(prefix="/settings", tags=["Settings"])

class ValidatePathRequest(BaseModel):
    path: str

@router.get("")
async def get_settings():
    db_settings = {}
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Setting))
        for row in result.scalars().all():
            try:
                db_settings[row.key] = json.loads(row.value)
            except Exception:
                db_settings[row.key] = row.value

    return {
        "default_destination": db_settings.get("default_destination", settings.DEFAULT_DESTINATION),
        "default_quality": db_settings.get("default_quality", "original"),
        "default_format": db_settings.get("default_format", "mp4"),
        "concurrency": worker_pool.concurrency,
        "max_retries": db_settings.get("max_retries", settings.DEFAULT_MAX_RETRIES),
        "auto_organize": db_settings.get("auto_organize", True),
        "prefer_mp4": db_settings.get("prefer_mp4", True),
        "speed_limit_kbps": db_settings.get("speed_limit_kbps", 0),
        "ffmpeg_path": settings.FFMPEG_PATH,
        "ffprobe_path": settings.FFPROBE_PATH,
    }

@router.patch("")
async def update_settings(req: SettingsUpdateRequest):
    async with AsyncSessionLocal() as session:
        async def set_key(key: str, val):
            if val is not None:
                record = await session.get(Setting, key)
                val_str = json.dumps(val)
                if record:
                    record.value = val_str
                    record.updated_at = utcnow()
                else:
                    session.add(Setting(key=key, value=val_str))

        if req.default_destination:
            p = Path(req.default_destination)
            try:
                p.mkdir(parents=True, exist_ok=True)
                settings.DEFAULT_DESTINATION = str(p.resolve())
                await set_key("default_destination", str(p.resolve()))
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid destination folder: {e}")

        if req.concurrency:
            worker_pool.set_concurrency(req.concurrency)
            await set_key("concurrency", req.concurrency)

        await set_key("default_quality", req.default_quality)
        await set_key("default_format", req.default_format)
        await set_key("max_retries", req.max_retries)
        await set_key("auto_organize", req.auto_organize)
        await set_key("prefer_mp4", req.prefer_mp4)
        await set_key("speed_limit_kbps", req.speed_limit_kbps)

        await session.commit()
    return {"status": "updated"}

@router.post("/validate-path")
async def validate_path(req: ValidatePathRequest):
    p = Path(req.path)
    try:
        p.mkdir(parents=True, exist_ok=True)
        # Test write permission
        test_file = p / ".savexa_test_write"
        test_file.touch()
        test_file.unlink()
        return {"valid": True, "path": str(p.resolve()), "writable": True}
    except Exception as e:
        return {"valid": False, "path": req.path, "error": str(e), "writable": False}

