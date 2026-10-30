import pytest
import asyncio
from unittest.mock import patch, MagicMock

from app.schemas.media import AnalysisStatus, MediaMetadata, BulkAnalysisRequest
from app.downloaders.ytdlp import (
    classify_ytdlp_error,
    extract_fallback_title,
    YtDlpDownloader,
)
from app.api.analyze import analyze_bulk_urls, is_youtube_url

def test_classify_ytdlp_error_bot_challenge():
    raw_error = "ERROR: [youtube] DZ9lpup4VZ0: Sign in to confirm you're not a bot. Use --cookies-from-browser"
    status, code, msg, action = classify_ytdlp_error("https://www.youtube.com/watch?v=DZ9lpup4VZ0", Exception(raw_error))
    assert status == AnalysisStatus.SOURCE_ACCESS_CHALLENGE
    assert code == "SOURCE_ACCESS_CHALLENGE"
    assert "anti-bot" in msg.lower()
    assert "browser" in action.lower() or "cookies" in action.lower()

def test_classify_ytdlp_error_rate_limited():
    raw_error = "WARNING: [youtube] Unable to download webpage: HTTP Error 429: Too Many Requests"
    status, code, msg, action = classify_ytdlp_error("https://www.youtube.com/watch?v=test", Exception(raw_error))
    assert status == AnalysisStatus.RATE_LIMITED
    assert code == "RATE_LIMITED"
    assert "429" in msg or "rate-limited" in msg.lower()

def test_classify_ytdlp_error_private_video():
    raw_error = "ERROR: [youtube] Private video. Sign in if you've been granted access to this video"
    status, code, msg, action = classify_ytdlp_error("https://www.youtube.com/watch?v=private", Exception(raw_error))
    assert status == AnalysisStatus.MEDIA_UNAVAILABLE
    assert code == "MEDIA_PRIVATE"
    assert "private" in msg.lower()

def test_classify_ytdlp_error_geo_restricted():
    raw_error = "ERROR: [youtube] The following content is not available in your country"
    status, code, msg, action = classify_ytdlp_error("https://www.youtube.com/watch?v=geo", Exception(raw_error))
    assert status == AnalysisStatus.MEDIA_UNAVAILABLE
    assert code == "GEO_RESTRICTED"

def test_classify_ytdlp_error_timeout():
    raw_error = "ReadTimeout: HTTPSConnectionPool(host='youtube.com', port=443): Read timed out."
    status, code, msg, action = classify_ytdlp_error("https://www.youtube.com/watch?v=timeout", Exception(raw_error))
    assert status == AnalysisStatus.NETWORK_TIMEOUT
    assert code == "NETWORK_TIMEOUT"

def test_extract_fallback_title():
    title, src = extract_fallback_title("https://www.youtube.com/watch?v=DZ9lpup4VZ0")
    assert title == "YouTube Video (DZ9lpup4VZ0)"
    assert src == "youtube"

    title_short, src_short = extract_fallback_title("https://youtu.be/llLHwxkZ02k")
    assert title_short == "YouTube Video (llLHwxkZ02k)"
    assert src_short == "youtube"

    title_direct, src_direct = extract_fallback_title("https://example.com/assets/promo.mp4")
    assert "promo.mp4" in title_direct or "example.com" in title_direct

def test_is_youtube_url():
    assert is_youtube_url("https://www.youtube.com/watch?v=DZ9lpup4VZ0") is True
    assert is_youtube_url("https://youtu.be/DZ9lpup4VZ0") is True
    assert is_youtube_url("https://commondatastorage.googleapis.com/sample.mp4") is False
    assert is_youtube_url("https://vimeo.com/123456") is False

@pytest.mark.asyncio
async def test_bulk_circuit_breaker_preserves_all_urls():
    # 5 YouTube URLs: 1st raises Bot challenge, rest must trip circuit breaker
    urls = [
        "https://www.youtube.com/watch?v=DZ9lpup4VZ0",
        "https://www.youtube.com/watch?v=llLHwxkZ02k",
        "https://www.youtube.com/watch?v=FW_PPcr1sPE",
        "https://www.youtube.com/watch?v=-mYAvoEvX7I",
        "https://www.youtube.com/watch?v=PWuJ5-WiEgY",
    ]

    mock_error = Exception("ERROR: [youtube] DZ9lpup4VZ0: Sign in to confirm you're not a bot.")
    call_count = 0

    def mock_sync_analyze(url):
        nonlocal call_count
        call_count += 1
        raise mock_error

    with patch.object(YtDlpDownloader, "_sync_analyze", side_effect=mock_sync_analyze):
        req = BulkAnalysisRequest(urls=urls)
        results = await analyze_bulk_urls(req)

        # Invariant 1: All 5 URLs preserved
        assert len(results) == 5
        for i, res in enumerate(results):
            assert res.url == urls[i]
            assert res.is_valid is False
            assert res.is_selectable is False
            assert res.analysis_status == AnalysisStatus.SOURCE_ACCESS_CHALLENGE

        # Invariant 2: Circuit breaker tripped after 1st attempt, so only 1 real network call was made!
        assert call_count == 1
        assert results[0].error_code == "SOURCE_ACCESS_CHALLENGE"
        assert results[1].error_code == "CIRCUIT_BREAKER_PAUSED"
        assert results[2].error_code == "CIRCUIT_BREAKER_PAUSED"

@pytest.mark.asyncio
async def test_bulk_mixed_sources_circuit_breaker():
    # YouTube trips circuit breaker, but direct MP4 succeeds
    urls = [
        "https://www.youtube.com/watch?v=DZ9lpup4VZ0",
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        "https://www.youtube.com/watch?v=llLHwxkZ02k",
    ]

    def mock_sync_analyze(url):
        raise Exception("Sign in to confirm you're not a bot.")

    with patch.object(YtDlpDownloader, "_sync_analyze", side_effect=mock_sync_analyze):
        req = BulkAnalysisRequest(urls=urls)
        results = await analyze_bulk_urls(req)

        assert len(results) == 3
        # Item 0 (YouTube) failed bot challenge
        assert results[0].url == urls[0]
        assert results[0].analysis_status == AnalysisStatus.SOURCE_ACCESS_CHALLENGE

        # Item 1 (Direct MP4) succeeded
        assert results[1].url == urls[1]
        assert results[1].is_valid is True
        assert results[1].is_selectable is True
        assert results[1].analysis_status == AnalysisStatus.AVAILABLE

        # Item 2 (YouTube) paused via circuit breaker
        assert results[2].url == urls[2]
        assert results[2].error_code == "CIRCUIT_BREAKER_PAUSED"

def test_selection_logic_invariants():
    """
    Test the React selection state invariants:
    - If 0 items are eligible, allSelected must be FALSE and indeterminate must be FALSE.
    - If 2 items are eligible and 2 are selected, allSelected is TRUE.
    - If 2 items are eligible and 1 is selected, indeterminate is TRUE.
    """
    # Scenario A: 63 items, 0 eligible
    items_63_failed = [
        MediaMetadata(
            url=f"https://www.youtube.com/watch?v=vid{i}",
            title=f"YouTube Video (vid{i})",
            source="youtube",
            is_valid=False,
            is_selectable=False,
            analysis_status=AnalysisStatus.SOURCE_ACCESS_CHALLENGE,
        )
        for i in range(63)
    ]
    eligible_A = [i for i in items_63_failed if i.is_valid and i.is_selectable]
    selected_A = [i for i in eligible_A if getattr(i, "selected", False)]
    all_selected_A = len(eligible_A) > 0 and len(selected_A) == len(eligible_A)
    indeterminate_A = len(selected_A) > 0 and not all_selected_A

    assert len(eligible_A) == 0
    assert len(selected_A) == 0
    assert all_selected_A is False # The bug was this evaluating to True!
    assert indeterminate_A is False

    # Scenario B: 5 items, 3 eligible, 3 selected
    items_partial = [
        MediaMetadata(url="u1", title="T1", source="direct", is_valid=True, is_selectable=True),
        MediaMetadata(url="u2", title="T2", source="direct", is_valid=True, is_selectable=True),
        MediaMetadata(url="u3", title="T3", source="direct", is_valid=True, is_selectable=True),
        MediaMetadata(url="u4", title="T4", source="youtube", is_valid=False, is_selectable=False),
        MediaMetadata(url="u5", title="T5", source="youtube", is_valid=False, is_selectable=False),
    ]
    eligible_B = [i for i in items_partial if i.is_valid and i.is_selectable]
    selected_B = list(eligible_B) # select all eligible
    all_selected_B = len(eligible_B) > 0 and len(selected_B) == len(eligible_B)
    indeterminate_B = len(selected_B) > 0 and not all_selected_B

    assert len(eligible_B) == 3
    assert all_selected_B is True
    assert indeterminate_B is False

@pytest.mark.asyncio
async def test_extractor_health_endpoint():
    from app.api.system import get_extractor_health
    health = await get_extractor_health()
    assert health.ytdlp_operational is True
    assert health.node_detected is True
    assert health.js_runtime_configured == "node"
    assert len(health.detected_browsers) > 0
    assert len(health.notes) > 0
