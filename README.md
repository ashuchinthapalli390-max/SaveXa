# SaveXa
### One Link. Endless Possibilities.
**Local-first • Ad-free • Bulk downloads • Universal Media Download Manager**

SaveXa is a premium local media download manager running on `http://localhost:3000` backed by a high-performance Python FastAPI engine (`http://127.0.0.1:8000`). It is engineered from the ground up for reliable bulk downloading (10, 50, 100+ links), bounded background concurrency, stream merging, and original quality preservation.

---

## 🌟 Key Features

### 1. Smart Link Inspector & Downloader
- Detects media source from single URL (YouTube, Vimeo, SoundCloud, Kick, direct file streams, etc.).
- Extracts title, thumbnail, duration, uploader, available resolutions (4K, 1440p, 1080p, 720p, 480p), and audio tracks.
- Merges separate video and audio streams seamlessly using FFmpeg without lossy re-encoding.

### 2. Bulk Download Engine (Primary Core Capability)
- Accepts **10, 50, 100, or 500+ URLs** in a single batch.
- Large multiline input, plus one-click **Import TXT** and **Import CSV** support.
- Real-time link parsing: reports total, valid, duplicate, and malformed counts.
- **Bounded Worker Concurrency**: Configure 1, 2, 3, 5, 8, or 10 simultaneous downloads (default: 3). Jobs wait in an SQLite-persisted queue and start as worker slots open.
- **Error Isolation**: If 1 link in a 100-link batch fails, the remaining 99 continue uninterrupted. Failed jobs can be retried independently.

### 3. Original Quality Preservation Engine
- **Original / Best Available Mode**: Evaluates every source stream independently. A 4K video stays 4K; a 1080p video stays 1080p; audio stays pristine.
- Never upscales or applies unnecessary lossy re-encoding.
- Uses FFmpeg stream copying whenever source codecs permit.

### 4. AudioXa Mode
- Dedicated audio extraction and conversion to **MP3, M4A, FLAC, OPUS, and WAV**.
- Configurable bitrates: **320 kbps (Maximum Fidelity)**, 256 kbps, 192 kbps, and 128 kbps.
- Preserves embedded tags and artwork.

### 5. Playlists Enumerator
- Enumerate full playlists and album collections into individual selectable media items.
- Preserves numbering and index (`01 - Title.mp4`, `02 - Title.mp4`).

### 6. SaveXa Media Library
- In-browser HTML5 video and audio preview player.
- **Trim Clip Tool**: Cut start and end timestamps (`HH:MM:SS`) and export trimmed clips via FFmpeg.
- **Windows Explorer Integration**: One-click to highlight downloaded files or open containing directories.

### 7. Persistent Download Queue & Restart Recovery
- SQLite database in **WAL mode** persists all batch progress, download jobs, and history.
- Survived browser refresh or machine reboot: interrupted downloads are safely recovered without re-downloading completed files.
- Real-time updates via WebSocket (`/ws`) throttled for high UI performance.

### 8. Security & SSRF Protection
- Strict protocol restrictions (only `http://` and `https://` remote URLs).
- Blocks SSRF: rejects loopback (`127.0.0.1`, `localhost`), link-local (`169.254.169.254`), and private RFC 1918 subnets.
- Windows filename sanitization: escapes reserved device names (`CON`, `PRN`, `AUX`, `NUL`, etc.) and removes illegal characters (`< > : " / \ | ? *`).

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, Motion for React (`motion/react`), GSAP (`gsap`, `@gsap/react`), Lucide React, React Router |
| **Backend** | Python 3.12, FastAPI, SQLAlchemy 2.0 (async), SQLite (WAL mode), Pydantic v2, httpx, Uvicorn |
| **Media Engine** | yt-dlp, FFmpeg 9.0, ffprobe |
| **Real-time** | WebSockets (`/ws`) |

---

## 🚀 Quick Start (Windows)

### Option A: One-Click Launch
Double-click:
```bat
start_windows.bat
```
This automatically starts the backend API (`http://127.0.0.1:8000`), the frontend dev server (`http://localhost:3000`), and launches your default browser.

### Option B: Manual Setup & Execution

#### 1. Setup Backend
```powershell
# Create venv and install dependencies
python -m venv backend\.venv
.\backend\.venv\Scripts\pip install -r backend\requirements.txt

# Run backend
$env:PYTHONPATH = "backend"
.\backend\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

#### 2. Setup Frontend
```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```
Open **http://localhost:3000** in your browser.

---

## 🧪 Running Automated Tests

Run the test suite covering single direct downloads, the critical 10-link concurrent batch acceptance test, error resilience, and SSRF security:
```powershell
$env:PYTHONPATH = "backend"
.\backend\.venv\Scripts\pytest backend\tests -v
```

---

## 📂 Project Directory Structure

```text
SaveXa/
├── frontend/
│   ├── src/
│   │   ├── animations/          # Motion & GSAP animation presets
│   │   ├── components/
│   │   │   ├── layout/          # Sidebar, TopBar, SaveXaLogo
│   │   │   └── downloads/       # DownloadCard with live progress & controls
│   │   ├── pages/               # Dashboard, BulkDownloader, Queue, AudioXa, Library, etc.
│   │   ├── services/            # Typed API client
│   │   ├── hooks/               # useSaveXaSocket real-time hook
│   │   ├── types/               # TypeScript data models
│   │   ├── App.tsx
│   │   └── index.css            # Tailwind CSS v4 & custom glass styling
│   └── package.json
│
├── backend/
│   ├── app/
│   │   ├── api/                 # FastAPI routes (analyze, downloads, batches, library, settings)
│   │   ├── core/                # Configuration & FFmpeg/path auto-detection
│   │   ├── database/            # SQLite connection with WAL mode
│   │   ├── downloaders/         # DirectDownloader & YtDlpDownloader
│   │   ├── models/              # SQLAlchemy entities (Batch, DownloadJob, DownloadHistory)
│   │   ├── queue/               # WorkerPool & WebSocket ConnectionManager
│   │   ├── schemas/             # Pydantic v2 schemas
│   │   ├── services/            # FFmpegService & media inspection
│   │   ├── utils/               # Security, SSRF prevention, filename sanitizer
│   │   └── main.py              # Application entrypoint & WebSocket endpoint
│   ├── requirements.txt
│   └── tests/                   # Deterministic test suite
│
├── scripts/
│   ├── setup_windows.ps1        # Automated setup script
│   ├── check_dependencies.ps1  # Tool validation script
│   └── start_windows.bat        # One-click startup launcher
│
├── data/                        # Persistent SQLite database (savexa.db) & temp merges
└── README.md
```

---

## ⚖️ Legal & Source Limitations

SaveXa is designed for rights-holders, publicly accessible media, and authorized downloading. It does not circumvent DRM, defeat paywalls, or bypass private authentication systems. If an item is restricted or unavailable, SaveXa cleanly reports the status without crashing or interrupting other batch jobs.

