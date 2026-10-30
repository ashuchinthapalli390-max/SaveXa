# SaveXa Troubleshooting Guide

This guide covers common diagnostic scenarios, environment requirements, YouTube access challenges, and recovery procedures for the SaveXa platform on Windows localhost.

---

## 1. YouTube Access Challenges ("Sign in to confirm you're not a bot" / HTTP 429)

### Symptom
During link analysis or bulk downloads, YouTube items fail with:
- `HTTP Error 429: Too Many Requests`
- `Sign in to confirm you're not a bot.`
- Frontend displays: **"Access Challenge Required"**

### Root Causes
1. **Missing `yt-dlp-ejs` or JS Runtime**: Modern YouTube players employ JavaScript-based bot detection challenges that require yt-dlp's External JavaScript (EJS) engine. If `yt-dlp-ejs` or a supported JavaScript engine (Deno or Node.js) is missing, extraction fails immediately.
2. **IP Rate Limiting**: Sending dozens of automated requests in parallel causes YouTube to temporarily throttle your network connection.
3. **Account Authentication Requirement**: Certain content requires active user authentication cookies.

### Resolution Steps

#### Step 1: Verify Dependencies
Run the dependency checker:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\check_dependencies.ps1
```
Ensure:
- `yt-dlp[default]` and `yt-dlp-ejs>=0.8.0` are installed:
  ```powershell
  .\backend\.venv\Scripts\python -m pip install -U "yt-dlp[default]"
  ```
- Deno or Node.js is present:
  ```powershell
  winget install --id DenoLand.Deno --accept-source-agreements --accept-package-agreements --silent
  ```

#### Step 2: Use a Netscape `cookies.txt` File (Recommended)
On Windows, when Chrome or Edge is open, Windows places an exclusive lock on `Network\Cookies` (`Win32 sharing violation error 32`). Direct `--cookies-from-browser` extraction fails with:
`Could not copy Chrome cookie database`.

**Safe Solution**:
1. Install a browser extension such as **Get cookies.txt LOCALLY** (open-source) in Chrome or Edge.
2. Navigate to [YouTube.com](https://www.youtube.com) while signed in.
3. Export your YouTube cookies as `cookies.txt`.
4. Place the file at `backend/data/cookies.txt`.
5. SaveXa automatically detects and loads `backend/data/cookies.txt` for all extraction and download jobs.

#### Step 3: Polite Pacing and Circuit Breaker
SaveXa includes an automated **Anti-Bot Circuit Breaker**:
- When YouTube signals rate limiting or bot verification, SaveXa pauses subsequent automated requests to preserve your connection reputation.
- All submitted links remain safely in the interface and can be exported as `.txt` or copied to clipboard.

---

## 2. Duplicate Downloads & Existing Files

### Symptom
You submit a large list of links where some videos are already downloaded in the destination folder.

### Expected Behavior
- SaveXa's **Duplicate Skipping Engine** checks both:
  1. The SQLite persistent download history (`DownloadHistory`).
  2. The local target directory on disk (`*.mp4` files matching `[<video_id>]`).
- Any media file that already exists on disk with a valid size is marked as `SKIPPED` in the batch summary or instantly completed in 0ms without re-transferring bytes.

---

## 3. JavaScript Runtime (EJS) Configuration

SaveXa supports both **Deno** and **Node.js** as external JavaScript runtimes for `yt-dlp-ejs`:
- **Deno** is the preferred engine (sandboxed, fast initialization).
- **Node.js** serves as a reliable secondary fallback.

To verify your configured runtime:
1. Open SaveXa at `http://localhost:3000`.
2. Go to **Settings** (`/settings`).
3. Inspect the **Source Compatibility Diagnostics** panel:
   - `yt-dlp Engine`: Active version
   - `yt-dlp-ejs`: Installed version
   - `JS Runtimes`: Active runtime (Deno + Node.js)
   - `Cookies Session`: Loaded or Anonymous
4. Click **Run Diagnostics Check** to run a live latency and compatibility test.

---

## 4. Stalled Downloads & Auto-Recovery

### Symptom
A download displays `STALLED` state with 0 KB/s.

### Behavior
- The WorkerPool monitors active jobs. If a job receives 0 bytes for over 30 seconds, it transitions to `STALLED`.
- The worker pool prevents infinite retry loops for anti-bot / rate-limited sources.
- You can manually retry individual stalled items or pause/resume the entire queue.

---

## 5. File System Permissions & Folder Selection

### Default Path
SaveXa defaults to:
`C:\Users\<Username>\Downloads\SaveXa`

- You can configure custom download folders (including subfolders such as `SaveXa\trailers`) in **Settings** or on the **Bulk Downloader** page.
- Always ensure the destination path is writable and not on a read-only network share.

---

## 6. Local Optional Source Authentication (Chrome Browser Session)

### Overview
SaveXa supports local browser session extraction using supported yt-dlp `--cookies-from-browser` options for Google Chrome.
- **Strict Privacy**: Credentials and cookies remain 100% on your local machine and are never transmitted, logged, or exported.
- **Explicit User Approval**: The browser session is never accessed unless you explicitly approve it in **Settings**.
- **Source Restriction Disclaimer**: Authentication uses local account cookies and cannot bypass DRM, copyright take-downs, or private memberships without access.

### Windows SQLite Database Lock (`BROWSER_COOKIE_LOCKED`)
When Google Chrome is actively running on Windows, it holds an exclusive process lock on its SQLite cookie database (`Network\Cookies`). yt-dlp will report `BROWSER_COOKIE_LOCKED`:
> *Google Chrome is actively running and locking its cookie session on Windows.*

**Recommended Workarounds**:
1. **Option A (Quickest)**: Close Google Chrome temporarily before resuming the download queue.
2. **Option B (Recommended for active browsing)**: Export cookies to `backend/data/cookies.txt` using a browser extension like *Get cookies.txt LOCALLY*. SaveXa automatically reads `cookies.txt` with zero file locking conflicts.

### Disconnecting
To return to anonymous mode at any time, navigate to **Settings** and click **"Disconnect Session (Revert to Anonymous)"**.

