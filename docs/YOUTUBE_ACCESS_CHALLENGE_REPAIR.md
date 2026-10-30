# SaveXa: YouTube Access Challenge Diagnostics, Dependency Repair & Bulk Downloader Recovery

**Priority:** P0 — Critical Full-Stack Diagnostic & Infrastructure Report  
**Platform:** Windows Localhost  
**Frontend:** React 19 + TypeScript + Tailwind CSS + Framer Motion / Motion + GSAP  
**Backend:** Python 3.12 + FastAPI + yt-dlp + FFmpeg + SQLite  
**Date:** October 31, 2026  

---

## 1. Executive Summary

During bulk media analysis and downloading of large URL batches (such as trailer collections up to 200 items), SaveXa users encountered repeated YouTube access challenges:
- `Sign in to confirm you're not a bot.`
- `HTTP Error 429: Too Many Requests`
- Interface state: **"Access Challenge Required"**

A comprehensive end-to-end investigation was executed across the Windows environment, Python virtualenv, yt-dlp dependencies, external JavaScript runtimes, SQLite persistence, and React frontend. Genuine dependency gaps and configuration problems were identified and repaired, robust anti-bot circuit breaking was implemented, on-disk duplicate detection was added, and the full test suite now passes with 100% integrity.

---

## 2. Environment Verification & Diagnostic Results

The system was inspected using the official verification commands specified in the project directive:

| Component | Target Requirement | Status Before Repair | Status After Repair | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **yt-dlp** | `python -m yt_dlp --version` | `2026.10.26` | `2026.10.26` | Universal extractor present |
| **yt-dlp-ejs** | `pip show yt-dlp-ejs` | **Missing** (`Package not found`) | **v0.8.0 Installed** | Installed via `yt-dlp[default]` |
| **Deno** | `deno --version` | **Missing** (Not in PATH) | **v2.9.8 Installed** | Installed via WinGet (`DenoLand.Deno`) |
| **Node.js** | `node --version` | `v24.20.0` | `v24.20.0` | Dual-engine fallback runtime |
| **FFmpeg** | `ffmpeg -version` | `9.0.1-essentials` | `9.0.1-essentials` | Active for audio extraction & remux |

### Root Cause Analysis

1. **Missing `yt-dlp-ejs` Package**:
   Modern YouTube video players run sophisticated JavaScript-based bot detection challenges. In previous versions of the environment, `yt-dlp` was installed without optional extras, lacking the `yt-dlp-ejs` package. Without this package, yt-dlp cannot run player JavaScript challenges.

2. **Absence of Deno Runtime**:
   By default, `yt-dlp-ejs` specifically defaults to `deno`. When neither Deno was present nor `--js-runtimes node` was explicitly mapped, yt-dlp logged:
   `WARNING: No supported JavaScript runtime could be found. Only deno is enabled by default.`

3. **Active IP-Level YouTube Throttling (HTTP 429)**:
   Sequential queries against YouTube without cookies triggered YouTube's automated abuse filters, resulting in HTTP 429 and mandatory bot confirmation on the local residential/host IP.

4. **Windows Browser Database File Lock (Win32 Error 32)**:
   Attempting to use `--cookies-from-browser chrome` fails on Windows when Google Chrome is open, because Chrome locks `Network\Cookies` exclusively. The safe resolution is loading a static Netscape `backend/data/cookies.txt` exported once from the browser.

---

## 3. Implemented Fixes & Upgrades

### Feature 1: Dedicated `ExtractorHealthService`
Created [extractor_health.py](file:///c:/Users/ashuc/OneDrive/Desktop/DEV/SaveXa/backend/app/services/extractor_health.py):
- Inspects real-time versions of `yt-dlp`, `yt-dlp-ejs`, `node`, `deno`, and `ffmpeg`.
- Scans user AppData and WinGet packages for dynamically located runtimes.
- Scans for installed browsers (`chrome`, `edge`, `firefox`, `brave`) and checks for `backend/data/cookies.txt`.
- Provides an automated reachability test endpoint (`POST /api/system/extractor-test`).

### Feature 2: JavaScript Runtime (Deno + Node) Configuration
Updated [ytdlp.py](file:///c:/Users/ashuc/OneDrive/Desktop/DEV/SaveXa/backend/app/downloaders/ytdlp.py):
- Automatically provisions `js_runtimes` for both Deno (`C:\Users\ashuc\AppData\Local\Microsoft\WinGet\Packages\DenoLand.Deno_*\deno.exe`) and Node.js (`C:\Program Files\nodejs\node.EXE`).
- Automatically feeds `cookiefile` from `backend/data/cookies.txt` when present.

### Feature 3: YouTube Anti-Bot Circuit Breaker & Polite Pacing
Updated [analyze.py](file:///c:/Users/ashuc/OneDrive/Desktop/DEV/SaveXa/backend/app/api/analyze.py):
- Segregated concurrency: General links run with up to 16 workers, while YouTube links run sequentially with a 0.35s polite pacing interval.
- When an anti-bot challenge or HTTP 429 is encountered, the Circuit Breaker trips:
  - Remaining YouTube items are safely marked `CIRCUIT_BREAKER_PAUSED` with friendly explanations.
  - Zero submitted URLs are lost or dropped.
  - All URLs remain visible in the UI with actions to copy or export.

### Feature 4: On-Disk Duplicate Detection & Skipping
Updated [batches.py](file:///c:/Users/ashuc/OneDrive/Desktop/DEV/SaveXa/backend/app/api/batches.py) and [ytdlp.py](file:///c:/Users/ashuc/OneDrive/Desktop/DEV/SaveXa/backend/app/downloaders/ytdlp.py):
- Matches YouTube video IDs (`[0-9A-Za-z_-]{11}`) against files already existing in the destination folder.
- When `skip_duplicates: true` is set (default), any item whose video ID exists on disk with a valid size is marked as `SKIPPED` in the batch or resolved instantly in 0ms without re-transferring.

### Feature 5: WorkerPool Anti-Bot Retry Guard
Updated [worker_pool.py](file:///c:/Users/ashuc/OneDrive/Desktop/DEV/SaveXa/backend/app/queue/worker_pool.py):
- Prevented infinite retries on anti-bot, CAPTCHA, or rate-limited errors (`no_retry_keywords = ["bot", "sign in to confirm", "captcha", "too many requests", "429"]`).
- Avoids flooding YouTube with failed retries that further damage network reputation.

### Feature 6: Frontend UI & Selection Logic Repair
Updated [BulkDownloader.tsx](file:///c:/Users/ashuc/OneDrive/Desktop/DEV/SaveXa/frontend/src/pages/BulkDownloader.tsx) and [Settings.tsx](file:///c:/Users/ashuc/OneDrive/Desktop/DEV/SaveXa/frontend/src/pages/Settings.tsx):
- **Fixed Select All bug**: Fixed `allSelected = eligibleCount > 0 && selectedCount === eligibleCount`. Disabled Select All button when zero eligible items exist.
- **Categorization Tabs**: Added filter tabs: `All`, `Available`, `Requires Attention`, `Unavailable`.
- **Diagnostics Panel**: Added 4 real-time diagnostic cards (`yt-dlp Engine`, `yt-dlp-ejs`, `JS Runtimes`, `Cookies Session`) with live reachability testing.
- **URL Preservation**: Added "Export TXT" and "Copy URLs" buttons so users never lose their batch list.

---

## 4. Trailer Collection Cross-Reference & Status

The user submitted a list of 192 trailer URLs and requested to:
> "DOWNLOAD ALL THESE VIDEOS WITH FOLDERNAME TRAILERS AND CHECK ALL THE VIDEOS ARE DOWNLOADING ALL"  
> "dont download again that are completed"

A physical inspection was conducted on `C:\Users\ashuc\Downloads\SaveXa\trailers`:

```
Total MP4 files on disk in trailers folder: 143
Total unique video IDs in request: 190
Completed matching videos already on disk: 25
Remaining un-downloaded videos: 165
```

### Duplicate Skipping in Action
- The 25 completed matching trailers (such as *3 Idiots*, *2 States*, *Kalki 2898 AD*, *Pushpa*, *RRR*, etc.) are recognized by video ID and skipped automatically by SaveXa.
- The remaining 165 URLs require authenticated cookies (`backend/data/cookies.txt`) due to YouTube's active IP throttling (HTTP 429).

---

## 5. Verification & Test Suite

### Backend Test Results (`pytest`)
All 21 backend unit, integration, and concurrency tests passed:
```
tests/test_analysis_resilience.py::test_classify_ytdlp_error_bot_challenge PASSED
tests/test_analysis_resilience.py::test_classify_ytdlp_error_rate_limited PASSED
tests/test_analysis_resilience.py::test_classify_ytdlp_error_private_video PASSED
tests/test_analysis_resilience.py::test_classify_ytdlp_error_geo_restricted PASSED
tests/test_analysis_resilience.py::test_classify_ytdlp_error_timeout PASSED
tests/test_analysis_resilience.py::test_extract_fallback_title PASSED
tests/test_analysis_resilience.py::test_is_youtube_url PASSED
tests/test_analysis_resilience.py::test_bulk_circuit_breaker_preserves_all_urls PASSED
tests/test_analysis_resilience.py::test_bulk_mixed_sources_circuit_breaker PASSED
tests/test_analysis_resilience.py::test_selection_logic_invariants PASSED
tests/test_analysis_resilience.py::test_extractor_health_endpoint PASSED
tests/test_download_engine.py::test_single_direct_download PASSED
tests/test_download_engine.py::test_ten_link_batch_concurrency PASSED
tests/test_download_engine.py::test_invalid_link_resilience PASSED
tests/test_download_engine.py::test_security_validation PASSED
tests/test_download_engine.py::test_bulk_200_limit PASSED
tests/test_v2_features.py::test_original_url_resolution PASSED
tests/test_v2_features.py::test_image_verification_and_conversion PASSED
tests/test_v2_features.py::test_zip_service_packaging PASSED
tests/test_v2_features.py::test_worker_pool_concurrency_modes PASSED
tests/test_v2_features.py::test_image_batch_creation PASSED

============================= 21 passed in 20.26s =============================
```

### Frontend Build Results (`npm run build`)
```
✓ 2485 modules transformed.
dist/index.html                   0.69 kB │ gzip:   0.44 kB
dist/assets/index-CuB8FFUH.css   61.15 kB │ gzip:  10.28 kB
dist/assets/index-B4tIFSzn.js   613.48 kB │ gzip: 188.38 kB
✓ built in 2.21s
```

### Live Extractor Health API (`GET /api/system/extractor-health`)
```json
{
  "ytdlp_version": "2026.10.26",
  "ytdlp_operational": true,
  "ejs_installed": true,
  "ejs_version": "0.8.0",
  "js_runtime_configured": "deno",
  "node_detected": true,
  "node_version": "v24.20.0",
  "node_path": "C:\\Program Files\\nodejs\\node.EXE",
  "deno_detected": true,
  "deno_version": "deno 2.9.8",
  "deno_path": "C:\\Users\\ashuc\\AppData\\Local\\Microsoft\\WinGet\\Packages\\DenoLand.Deno_...\\deno.exe",
  "ffmpeg_detected": true,
  "ffmpeg_version": "ffmpeg version 9.0.1-essentials",
  "detected_browsers": ["chrome", "edge"],
  "cookies_file_present": false
}
```

---

## 6. Recommended Next Steps for the User

1. **Export YouTube Cookies into `backend/data/cookies.txt`**:
   To immediately bypass YouTube's active IP rate limits without waiting for residential IP cool-off:
   - Export cookies using an extension like **Get cookies.txt LOCALLY**.
   - Save as `backend/data/cookies.txt`.
2. **Launch Application**:
   Double click `start_windows.bat` or run:
   ```cmd
   start_windows.bat
   ```
3. **Verify Settings**:
   Navigate to `http://localhost:3000/settings` and observe that all 4 diagnostic cards display active and operational status.
