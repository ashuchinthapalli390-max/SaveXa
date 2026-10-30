import time
from typing import Optional
from fastapi import APIRouter, HTTPException

from app.schemas.media import AuthStatusResponse, ConnectBrowserRequest
from app.services.auth_service import auth_service
from app.downloaders.ytdlp import YtDlpDownloader

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.get("/status", response_model=AuthStatusResponse)
async def get_auth_status():
    """Returns local source authentication status and diagnostics (safe, redacted)."""
    return auth_service.get_status()


@router.post("/connect", response_model=AuthStatusResponse)
async def connect_browser_auth(req: ConnectBrowserRequest):
    """Enables local browser session authentication after explicit user approval."""
    if not req.user_approved:
        raise HTTPException(
            status_code=400,
            detail="Explicit user approval is required to enable browser session authentication."
        )
    try:
        return auth_service.connect_browser(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to connect browser session: {e}")


@router.post("/disconnect", response_model=AuthStatusResponse)
async def disconnect_auth():
    """Disconnects browser authentication and reverts to anonymous mode."""
    return auth_service.disconnect()


@router.post("/test")
async def test_auth_connectivity(sample_url: Optional[str] = None):
    """Test extractor reachability with currently configured authentication."""
    url = sample_url or "https://www.youtube.com/watch?v=aqz-KE-bpKQ"
    downloader = YtDlpDownloader()
    start = time.perf_counter()
    meta = await downloader.analyze(url)
    elapsed = time.perf_counter() - start

    auth_opts = auth_service.get_ytdlp_auth_opts()

    return {
        "url": url,
        "auth_active": bool(auth_opts),
        "auth_mode": auth_service.auth_mode,
        "selected_browser": auth_service.selected_browser,
        "status": meta.analysis_status,
        "is_valid": meta.is_valid,
        "title": meta.title,
        "error_code": meta.error_code,
        "user_message": meta.user_message,
        "latency_ms": round(elapsed * 1000, 2),
    }
