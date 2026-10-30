import asyncio
import logging
from typing import List
from fastapi import APIRouter

from app.downloaders.direct import DirectDownloader
from app.downloaders.ytdlp import YtDlpDownloader, extract_fallback_title, classify_ytdlp_error
from app.schemas.media import (
    UrlAnalysisRequest,
    BulkAnalysisRequest,
    MediaMetadata,
    AnalysisStatus,
)
from app.utils.security import validate_url

logger = logging.getLogger("savexa.analyze")
router = APIRouter(prefix="/analyze", tags=["Analyze"])

direct_dl = DirectDownloader()
ytdlp_dl = YtDlpDownloader()

def is_youtube_url(url: str) -> bool:
    u = url.lower()
    return "youtube.com" in u or "youtu.be" in u

async def analyze_single_url(url: str, allow_localhost: bool = False) -> MediaMetadata:
    url = url.strip()
    is_valid, reason = validate_url(url, allow_localhost_for_testing=allow_localhost)
    if not is_valid:
        return MediaMetadata(
            url=url,
            title="Invalid URL",
            source="unknown",
            is_valid=False,
            analysis_status=AnalysisStatus.FAILED,
            error_code="INVALID_URL",
            user_message=reason or "The provided URL format is invalid.",
            suggested_action="Verify the URL starts with http:// or https://",
            is_selectable=False,
            error=reason
        )

    try:
        if direct_dl.can_handle(url):
            return await direct_dl.analyze(url)
        else:
            return await ytdlp_dl.analyze(url)
    except Exception as e:
        status, code, user_msg, action = classify_ytdlp_error(url, e)
        fallback_title, detected_source = extract_fallback_title(url)
        return MediaMetadata(
            url=url,
            title=fallback_title,
            source=detected_source,
            is_valid=False,
            analysis_status=status,
            error_code=code,
            user_message=user_msg,
            suggested_action=action,
            is_selectable=False,
            raw_error=str(e),
            error=user_msg
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

    results: List[MediaMetadata | None] = [None] * len(bounded_urls)
    yt_circuit_tripped = False
    circuit_breaker_reason = ""

    general_tasks = []

    # Process YouTube sequentially with polite pacing and circuit breaker
    # This prevents triggering bot verification bursts
    for idx, url in enumerate(bounded_urls):
        if is_youtube_url(url):
            if yt_circuit_tripped:
                # Circuit breaker active: preserve URL without hammering YouTube
                fallback_title, detected_source = extract_fallback_title(url)
                results[idx] = MediaMetadata(
                    url=url,
                    title=fallback_title,
                    source=detected_source,
                    is_valid=False,
                    analysis_status=AnalysisStatus.SOURCE_ACCESS_CHALLENGE,
                    error_code="CIRCUIT_BREAKER_PAUSED",
                    user_message=(
                        "YouTube anti-bot verification required. Subsequent automated requests were paused "
                        "to protect your connection. Link safely preserved."
                    ),
                    suggested_action="Link preserved. You can open it directly or export links.",
                    is_selectable=False,
                    raw_error=f"Circuit breaker tripped by previous access challenge: {circuit_breaker_reason}",
                    error="YouTube anti-bot verification required. Automated analysis paused."
                )
            else:
                item_result = await analyze_single_url(url, req.allow_localhost)
                results[idx] = item_result

                # Check if YouTube anti-bot or rate-limit challenge occurred
                if item_result.analysis_status in (
                    AnalysisStatus.SOURCE_ACCESS_CHALLENGE,
                    AnalysisStatus.RATE_LIMITED,
                ):
                    yt_circuit_tripped = True
                    circuit_breaker_reason = item_result.user_message or "Anti-bot challenge received"
                    logger.warning(
                        "YouTube anti-bot challenge or rate limit detected (%s). "
                        "Tripping circuit breaker for subsequent YouTube items in batch.",
                        item_result.error_code
                    )

                # Polite delay between YouTube queries
                await asyncio.sleep(0.35)
        else:
            # Non-YouTube items will be processed concurrently
            general_tasks.append((idx, url))

    # Process non-YouTube items with bounded concurrency (up to 16 workers)
    if general_tasks:
        sem = asyncio.Semaphore(16)
        async def fetch_general(idx: int, u: str):
            async with sem:
                res = await analyze_single_url(u, req.allow_localhost)
                results[idx] = res

        await asyncio.gather(*(fetch_general(idx, u) for idx, u in general_tasks))

    # Ensure no None entries and preserve original order
    final_results: List[MediaMetadata] = []
    for idx, item in enumerate(results):
        if item is not None:
            final_results.append(item)
        else:
            u = bounded_urls[idx]
            fallback_title, detected_source = extract_fallback_title(u)
            final_results.append(
                MediaMetadata(
                    url=u,
                    title=fallback_title,
                    source=detected_source,
                    is_valid=False,
                    analysis_status=AnalysisStatus.FAILED,
                    error_code="ANALYSIS_TIMEOUT",
                    user_message="Analysis did not complete.",
                    suggested_action="Retry this link.",
                    is_selectable=False,
                    error="Analysis did not complete"
                )
            )

    return final_results

