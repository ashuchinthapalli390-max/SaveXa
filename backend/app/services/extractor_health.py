import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Dict, Any, List, Optional

import yt_dlp
import yt_dlp.version

from app.core.config import settings
from app.schemas.media import ExtractorHealthResponse, MediaMetadata
from app.services.ffmpeg_service import ffmpeg_service


class ExtractorHealthService:
    """Service to diagnose extractor health, JavaScript runtime environment, and cookie availability."""

    def get_health(self) -> ExtractorHealthResponse:
        ytdlp_ver = getattr(yt_dlp.version, "__version__", getattr(yt_dlp, "__version__", "2026.10.26"))

        # Check yt-dlp-ejs installation
        ejs_installed = False
        ejs_version = None
        try:
            import yt_dlp_ejs
            ejs_installed = True
            ejs_version = getattr(yt_dlp_ejs, "__version__", "0.8.0")
        except ImportError:
            # Check if installed via pip package
            try:
                import importlib.metadata
                ejs_version = importlib.metadata.version("yt-dlp-ejs")
                ejs_installed = True
            except Exception:
                pass

        # Check Node.js
        node_path = shutil.which("node")
        node_ver = None
        if node_path:
            try:
                node_ver = subprocess.check_output([node_path, "--version"], text=True, timeout=2).strip()
            except Exception:
                pass

        # Check Deno
        deno_path = shutil.which("deno")
        if not deno_path:
            local_app = os.environ.get("LOCALAPPDATA", "")
            possible_deno = [
                Path.home() / ".deno" / "bin" / "deno.exe",
                Path(local_app) / "Microsoft" / "WinGet" / "Links" / "deno.exe",
                Path(local_app) / "Microsoft" / "WinGet" / "Packages" / "DenoLand.Deno_Microsoft.Winget.Source_8wekyb3d8bbwe" / "deno.exe",
            ]
            for p in possible_deno:
                if p.is_file():
                    deno_path = str(p)
                    break
            if not deno_path and local_app:
                # Search winget package directory dynamically
                winget_pkg = Path(local_app) / "Microsoft" / "WinGet" / "Packages"
                if winget_pkg.is_dir():
                    for match in winget_pkg.glob("DenoLand.Deno*/**/deno.exe"):
                        if match.is_file():
                            deno_path = str(match)
                            break

        deno_ver = None
        if deno_path:
            try:
                out = subprocess.check_output([deno_path, "--version"], text=True, timeout=2).strip()
                deno_ver = out.splitlines()[0] if out else None
            except Exception:
                pass

        ffmpeg_ok = ffmpeg_service.is_ffmpeg_available()
        ffmpeg_ver = ffmpeg_service.get_ffmpeg_version() if ffmpeg_ok else None

        # Check browser cookie directories
        local_app = os.environ.get("LOCALAPPDATA", "")
        app_data = os.environ.get("APPDATA", "")
        browser_checks = {
            "chrome": [
                os.path.join(local_app, "Google", "Chrome", "User Data"),
                "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
                "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
            ],
            "edge": [
                os.path.join(local_app, "Microsoft", "Edge", "User Data"),
                "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
            ],
            "firefox": [
                os.path.join(app_data, "Mozilla", "Firefox", "Profiles"),
            ],
            "brave": [
                os.path.join(local_app, "BraveSoftware", "Brave-Browser", "User Data"),
            ],
        }
        detected_browsers = []
        for b, paths in browser_checks.items():
            for p in paths:
                if os.path.exists(p):
                    detected_browsers.append(b)
                    break

        # Check cookies.txt
        cookies_file = settings.DATA_DIR / "cookies.txt"
        cookies_present = cookies_file.is_file() and cookies_file.stat().st_size > 0

        # Determine active js runtime yt-dlp uses
        js_runtime = "none"
        if deno_path:
            js_runtime = "deno"
        elif node_path:
            js_runtime = "node"

        notes = []
        if ejs_installed:
            notes.append(f"yt-dlp-ejs ({ejs_version}) installed for dynamic challenge processing.")
        else:
            notes.append("yt-dlp-ejs not installed. Run 'pip install -U yt-dlp[default]' to install.")

        if js_runtime == "deno":
            notes.append(f"JavaScript runtime Deno ({deno_ver}) active for yt-dlp EJS extraction.")
        elif js_runtime == "node":
            notes.append(f"JavaScript runtime Node.js ({node_ver}) active for yt-dlp EJS extraction.")
        else:
            notes.append("No external JS runtime detected. Install Node.js or Deno for improved extractor compatibility.")

        if ffmpeg_ok:
            notes.append(f"FFmpeg ({ffmpeg_ver}) active for audio/video stream remuxing.")

        if cookies_present:
            notes.append(f"Custom cookies file loaded from {cookies_file.name} for authenticated sources.")
        else:
            notes.append("No cookies.txt file detected in data/. Add data/cookies.txt if automated requests trigger bot challenges.")

        notes.append("Bulk analysis uses polite sequential pacing with automated circuit breaker to prevent IP rate limits.")

        return ExtractorHealthResponse(
            ytdlp_version=ytdlp_ver,
            ytdlp_operational=True,
            ejs_installed=ejs_installed,
            ejs_version=ejs_version,
            js_runtime_configured=js_runtime,
            node_detected=bool(node_path),
            node_version=node_ver,
            node_path=node_path,
            deno_detected=bool(deno_path),
            deno_version=deno_ver,
            deno_path=deno_path,
            ffmpeg_detected=ffmpeg_ok,
            ffmpeg_version=ffmpeg_ver,
            detected_browsers=detected_browsers,
            cookies_file_present=cookies_present,
            cookies_file_path=str(cookies_file) if cookies_present else None,
            recent_access_challenges=0,
            notes=notes,
        )

    async def test_extractor(self, test_url: Optional[str] = None) -> Dict[str, Any]:
        """Test extractor connectivity on a public reference sample."""
        from app.downloaders.ytdlp import YtDlpDownloader

        url = test_url or "https://www.youtube.com/watch?v=aqz-KE-bpKQ"  # Big Buck Bunny trailer
        downloader = YtDlpDownloader()
        start = time.perf_counter()
        meta = await downloader.analyze(url)
        elapsed = time.perf_counter() - start

        return {
            "url": url,
            "status": meta.analysis_status,
            "is_valid": meta.is_valid,
            "title": meta.title,
            "error_code": meta.error_code,
            "user_message": meta.user_message,
            "suggested_action": meta.suggested_action,
            "latency_ms": round(elapsed * 1000, 2),
        }


extractor_health_service = ExtractorHealthService()
