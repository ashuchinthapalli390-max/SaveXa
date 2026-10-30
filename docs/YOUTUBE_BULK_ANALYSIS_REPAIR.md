# SaveXa — Critical YouTube Bulk Analysis Repair & Source Compatibility Documentation

**Project:** SaveXa Media Download Manager  
**Environment:** Windows Localhost  
**Frontend:** React 19 + TypeScript + Motion + Tailwind CSS  
**Backend:** FastAPI + Python 3.12 + yt-dlp 2026.10.26 + FFmpeg 9.0.1 + Node.js v24.20.0  
**Resolution Status:** Verified & Fully Operational

---

## 1. Executive Summary & Problem Root Cause

When a batch of ~63 YouTube trailer URLs was submitted into the Bulk Downloader, two critical system failures occurred:

### Root Cause A: Burst Automated Analysis Triggering YouTube Anti-Bot Defense
- Previously, `analyze_bulk_urls` spawned up to 10 concurrent requests (`asyncio.Semaphore(10)`) hitting YouTube simultaneously.
- Unauthenticated burst requests from a single IP triggered YouTube's anti-scraping countermeasures, returning HTTP 429 and `Sign in to confirm you're not a bot`.
- Because there was no circuit breaker, the application continued making repeated failing requests across the entire list, compounding the network block.
- yt-dlp did not have external JavaScript runtimes explicitly configured in Python options, producing EJS deprecation warnings.

### Root Cause B: React Selection State Calculation Inconsistency
- In `BulkDownloader.tsx`, the selection state was calculated as:
  ```typescript
  const allSelected = mediaItems.length > 0 && selectedItems.length === mediaItems.filter((i) => i.is_valid).length;
  ```
- When all 63 items had `is_valid: false`:
  - `mediaItems.filter(i => i.is_valid).length` was `0`
  - `selectedItems.length` was `0`
  - `0 === 0` evaluated to `true`, and `mediaItems.length > 0` was `true`.
  - As a result, `allSelected` evaluated to `true`, causing the "Select All" checkbox to appear checked even though `0` items were selected or eligible.
- Raw Python exception tracebacks were directly displayed in red on item cards, cluttering the UI.

---

## 2. Architecture & Implementation Changes

### 2.1 Backend Error Classification & Resilience Taxonomy
In `backend/app/schemas/media.py` and `backend/app/downloaders/ytdlp.py`:
- Defined `AnalysisStatus` enum:
  - `AVAILABLE`: Media accessible, formats and streams resolved.
  - `SOURCE_ACCESS_CHALLENGE`: Anti-bot challenge, CAPTCHA, or authentication required.
  - `RATE_LIMITED`: HTTP 429 Too Many Requests.
  - `MEDIA_UNAVAILABLE`: Private, deleted, or geo-restricted content.
  - `NETWORK_TIMEOUT`: Socket or connection timeout.
  - `UNSUPPORTED`: Unrecognized media host or invalid URL.
  - `FAILED`: General extraction failure.
- Implemented `classify_ytdlp_error(url, exception)` mapping raw yt-dlp exceptions to normalized status, user message, and actionable guidance without flooding user interfaces with raw stack traces.
- Preserved `raw_error` exclusively for collapsible technical disclosure.
- Added friendly fallback title generator (`extract_fallback_title`) identifying YouTube video IDs (e.g. `YouTube Video (DZ9lpup4VZ0)`).

### 2.2 External JavaScript Runtime Integration
In `backend/app/downloaders/ytdlp.py`:
- Detected system Node.js (`v24.20.0` at `C:\Program Files\nodejs\node.EXE`).
- Configured yt-dlp `js_runtimes` with `{'node': {'path': node_path}}` to resolve YouTube EJS extraction without warnings.
- Added automatic detection for `data/cookies.txt` if cookie sessions are provided.

### 2.3 Source-Aware Concurrency & Circuit-Breaker Architecture
In `backend/app/api/analyze.py`:
- **Polite Sequential Pacing for YouTube**: YouTube queries are paced with a 0.35s polite delay between requests rather than hammering all at once.
- **Circuit Breaker**: When YouTube issues a `SOURCE_ACCESS_CHALLENGE` or `RATE_LIMITED`:
  1. The circuit breaker trips immediately.
  2. Further automated YouTube calls in that batch are halted to prevent extending IP rate limits.
  3. All remaining YouTube URLs in the batch are preserved with status `SOURCE_ACCESS_CHALLENGE` and code `CIRCUIT_BREAKER_PAUSED`.
  4. Non-YouTube URLs (direct MP4, images, other platforms) continue analyzing concurrently with up to 16 workers.
  5. 100% of submitted URLs are preserved with exact order fidelity.

### 2.4 React Selection State Invariants
In `frontend/src/pages/BulkDownloader.tsx`:
- Replaced buggy equality comparison with strict eligible item scoping:
  ```typescript
  const eligibleItems = useMemo(
    () => mediaItems.filter((i) => i.is_valid && i.is_selectable !== false),
    [mediaItems]
  );
  const eligibleCount = eligibleItems.length;
  const selectedItems = useMemo(
    () => mediaItems.filter((i) => i.selected && i.is_valid && i.is_selectable !== false),
    [mediaItems]
  );
  const selectedCount = selectedItems.length;

  const allSelected = eligibleCount > 0 && selectedCount === eligibleCount;
  const isIndeterminate = selectedCount > 0 && selectedCount < eligibleCount;
  ```
- "Select All" checkbox is disabled and unchecked when `eligibleCount === 0`.
- Added filter tabs: `All (${total})`, `Available (${eligibleCount})`, `Requires Attention (${attentionCount})`, `Unavailable (${unavailableCount})`.
- Designed clean Midnight Blue cards with category badges (Lock/Shield for Access Challenges, Clock for Rate Limits, Alert for Unavailable).
- Added collapsible "Details" disclosure for developers to inspect the raw yt-dlp traceback safely.
- Added direct "Open in Browser" action button for every preserved link.
- Added "Copy URLs" and "Export TXT" actions so the user never loses their submitted URLs.
- Added Attention Banner when 0 items are eligible, explaining why requests were paused and how to proceed.
- Action footer displays: `0 items ready for download • 63 items safely preserved in collection` and disables the download button cleanly.

### 2.5 Source Compatibility Diagnostics Panel
In `backend/app/api/system.py` and `frontend/src/pages/Settings.tsx`:
- Endpoint `GET /api/system/extractor-health` returns:
  - yt-dlp version & status (`2026.10.26`)
  - Active JS Runtime (Node.js `v24.20.0`)
  - FFmpeg engine (`version 9.0.1`)
  - Detected Windows browsers (`Chrome`, `Edge`)
  - Cookies file status (`data/cookies.txt`)
  - Diagnostic architectural notes
- Endpoint `POST /api/system/extractor-test` executes a live reachability test and measures round-trip latency in milliseconds.
- Settings page displays real-time health badges and an interactive "Run Diagnostics Check" button.

---

## 3. Verification & Automated Test Results

### 3.1 Backend Test Suite
Executed test suite in `backend/tests/test_analysis_resilience.py`:
- `test_classify_ytdlp_error_bot_challenge`: PASSED
- `test_classify_ytdlp_error_rate_limited`: PASSED
- `test_classify_ytdlp_error_private_video`: PASSED
- `test_classify_ytdlp_error_geo_restricted`: PASSED
- `test_classify_ytdlp_error_timeout`: PASSED
- `test_extract_fallback_title`: PASSED
- `test_is_youtube_url`: PASSED
- `test_bulk_circuit_breaker_preserves_all_urls`: PASSED
- `test_bulk_mixed_sources_circuit_breaker`: PASSED
- `test_selection_logic_invariants`: PASSED
- `test_extractor_health_endpoint`: PASSED

Full test suite execution: **21 passed in 31.58s** (100% pass rate).

### 3.2 Frontend Build & Compilation
- `tsc -b && vite build`: Succeeded in 3.88s with 0 TypeScript errors.
- Verified in browser and through live HTTP API endpoints.

---

## 4. User Guidance for YouTube Anti-Bot Challenges

When YouTube rate-limits automated requests on a network:
1. **Preserved URLs**: All links remain safely listed in the Bulk Downloader. You can click **"Copy URLs"** or **"Export TXT"** at any time.
2. **Individual Viewing**: Click **"Open"** on any card to view the video directly in your web browser.
3. **Session Cookies**:
   - Save your YouTube session cookies in Netscape format to `SaveXa/backend/data/cookies.txt`.
   - SaveXa will automatically load them for authenticated extraction without bot challenges.
4. **Diagnostics**: Open **Settings -> Source Compatibility Diagnostics** and click **"Run Diagnostics Check"** to monitor extractor health.
