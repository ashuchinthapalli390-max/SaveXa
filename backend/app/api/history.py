import os
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select, desc

from app.database.connection import AsyncSessionLocal
from app.models.entities import DownloadHistory
from app.schemas.media import DownloadHistoryResponse

router = APIRouter(prefix="/history", tags=["History"])

@router.get("", response_model=List[DownloadHistoryResponse])
async def get_history(
    format_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(300, ge=1, le=1000),
):
    async with AsyncSessionLocal() as session:
        stmt = select(DownloadHistory)
        if format_type:
            stmt = stmt.where(DownloadHistory.format == format_type)
        if search:
            stmt = stmt.where(DownloadHistory.title.ilike(f"%{search}%"))
        stmt = stmt.order_by(desc(DownloadHistory.completed_at)).limit(limit)
        result = await session.execute(stmt)
        records = result.scalars().all()
        return [DownloadHistoryResponse.model_validate(r) for r in records]

@router.delete("/{entry_id}")
async def delete_history_entry(entry_id: int, delete_file: bool = False):
    async with AsyncSessionLocal() as session:
        entry = await session.get(DownloadHistory, entry_id)
        if not entry:
            raise HTTPException(status_code=404, detail="History entry not found")
        
        if delete_file and entry.output_path:
            p = Path(entry.output_path)
            if p.is_file():
                try:
                    p.unlink(missing_ok=True)
                except Exception:
                    pass

        await session.delete(entry)
        await session.commit()
    return {"status": "deleted", "id": entry_id}

