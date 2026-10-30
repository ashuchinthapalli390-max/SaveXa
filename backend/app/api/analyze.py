import asyncio
from fastapi import APIRouter, HTTPException
from typing import List

from app.downloaders.direct import DirectDownloader
from app.downloaders.ytdlp import YtDlpDownloader
from app.schemas.media import (
    UrlAnalysisRequest,
    BulkAnalysisRequest,
    MediaMetadata,
)
from app.utils.security import validate_url

router = APIRouter(prefix="/analyze", tags=["Analyze"])

direct_dl = DirectDownloader()
ytdlp_dl = YtDlpDownloader()

async def analyze_single_url(url: str, allow_localhost: bool = False) -> MediaMetadata:
    url = url.strip()
    is_valid, reason = validate_url(url, allow_localhost_for_testing=allow_localhost)
    if not is_valid:
        return MediaMetadata(
            url=url,
            title="Invalid URL",
            source="unknown",
            is_valid=False,
            error=reason
        )

    try:
        if direct_dl.can_handle(url):
            return await direct_dl.analyze(url)
        else:
            return await ytdlp_dl.analyze(url)
    except Exception as e:
        return MediaMetadata(
            url=url,
            title="Analysis Failed",
            source="unknown",
            is_valid=False,
            error=str(e)
        )

@router.post("", response_model=MediaMetadata)
async def analyze_url(req: UrlAnalysisRequest):
    meta = await analyze_single_url(req.url, req.allow_localhost)
    return meta

@router.post("/bulk", response_model=List[MediaMetadata])
async def analyze_bulk_urls(req: BulkAnalysisRequest):
    urls = [u.strip() for u in req.urls if u.strip()]
    if not urls:
        return []

    # Limit to max 200 urls per request for bulk download engine
    bounded_urls = urls[:200]

    sem = asyncio.Semaphore(10)
    async def bound_analyze(u: str):
        async with sem:
            return await analyze_single_url(u, req.allow_localhost)

    results = await asyncio.gather(*(bound_analyze(u) for u in bounded_urls))
    return list(results)

