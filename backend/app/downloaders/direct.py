import asyncio
import os
import re
import time
from pathlib import Path
from typing import Callable, Any, Optional
from urllib.parse import urlparse, unquote
import httpx

from app.downloaders.base import BaseDownloader
from app.schemas.media import MediaMetadata, FormatOption
from app.utils.security import sanitize_filename

class DirectDownloader(BaseDownloader):
    """Downloader for direct HTTP/HTTPS files (MP4, MP3, ZIP, PDF, images, etc.)."""

    DIRECT_EXTENSIONS = {
        ".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv",
        ".mp3", ".m4a", ".wav", ".flac", ".opus", ".ogg", ".aac",
        ".zip", ".tar", ".gz", ".7z", ".rar",
        ".pdf", ".jpg", ".jpeg", ".png", ".webp", ".gif"
    }

    def can_handle(self, url: str) -> bool:
        try:
            parsed = urlparse(url)
            path = parsed.path.lower()
            return any(path.endswith(ext) for ext in self.DIRECT_EXTENSIONS)
        except Exception:
            return False

    async def analyze(self, url: str) -> MediaMetadata:
        parsed = urlparse(url)
        path = unquote(parsed.path)
        base_name = os.path.basename(path) or "download"
        clean_name = sanitize_filename(base_name)
        ext = Path(clean_name).suffix.lower().lstrip(".")

        file_size = None
        accepts_ranges = False

        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=httpx.Timeout(4.0, connect=2.0)) as client:
                head_resp = await client.head(url)
                if head_resp.status_code < 400:
                    cl = head_resp.headers.get("content-length")
                    if cl and cl.isdigit():
                        file_size = int(cl)
                    accepts_ranges = "bytes" in head_resp.headers.get("accept-ranges", "").lower()
                    
                    cd = head_resp.headers.get("content-disposition", "")
                    if "filename=" in cd:
                        match = re.search(r'filename\*?=(?:UTF-8\'\')?["\']?([^"\';]+)["\']?', cd, re.IGNORECASE)
                        if match:
                            clean_name = sanitize_filename(unquote(match.group(1)))
                            ext = Path(clean_name).suffix.lower().lstrip(".")
        except Exception:
            pass

        fmt = FormatOption(
            format_id="direct",
            ext=ext or "bin",
            resolution="Original",
            filesize=file_size,
            quality_label="Best Available (Direct Source)"
        )

        return MediaMetadata(
            url=url,
            canonical_url=url,
            media_id=clean_name,
            title=Path(clean_name).stem,
            source="direct",
            is_playlist=False,
            available_qualities=["original"],
            formats=[fmt],
            is_valid=True
        )

    async def download(
        self,
        job_id: str,
        url: str,
        destination_dir: str,
        quality: str,
        format_type: str,
        audio_bitrate: Optional[str],
        progress_callback: Callable[[dict[str, Any]], None],
        cancel_event: Optional[asyncio.Event] = None,
    ) -> str:
        dest_dir_path = Path(destination_dir)
        dest_dir_path.mkdir(parents=True, exist_ok=True)

        meta = await self.analyze(url)
        filename = sanitize_filename(f"{meta.title}.{meta.formats[0].ext if meta.formats else 'bin'}")
        final_file_path = dest_dir_path / filename
        part_file_path = dest_dir_path / f"{filename}.part"

        # Resume support: check if partial file exists
        downloaded = 0
        headers = {}
        if part_file_path.exists():
            downloaded = part_file_path.stat().st_size
            if downloaded > 0:
                headers["Range"] = f"bytes={downloaded}-"

        async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
            async with client.stream("GET", url, headers=headers) as response:
                if response.status_code in (416,): # Range not satisfiable, restart
                    part_file_path.unlink(missing_ok=True)
                    downloaded = 0
                    headers.pop("Range", None)
                    response = await client.stream("GET", url)

                if response.status_code >= 400:
                    raise RuntimeError(f"HTTP download failed with status {response.status_code}")

                # Determine total size
                content_range = response.headers.get("content-range")
                total_bytes = None
                if content_range:
                    match = re.search(r'/(\d+)', content_range)
                    if match:
                        total_bytes = int(match.group(1))
                elif "content-length" in response.headers:
                    cl = int(response.headers["content-length"])
                    total_bytes = downloaded + cl

                mode = "ab" if downloaded > 0 and response.status_code == 206 else "wb"
                if mode == "wb":
                    downloaded = 0

                last_update_time = time.time()
                bytes_since_update = 0
                speed = 0.0

                with open(part_file_path, mode) as f:
                    async for chunk in response.aiter_bytes(chunk_size=65536):
                        if cancel_event and cancel_event.is_set():
                            raise asyncio.CancelledError("Download cancelled by user")

                        f.write(chunk)
                        chunk_len = len(chunk)
                        downloaded += chunk_len
                        bytes_since_update += chunk_len

                        now = time.time()
                        delta = now - last_update_time
                        if delta >= 0.5:
                            speed = bytes_since_update / delta
                            last_update_time = now
                            bytes_since_update = 0

                            pct = (downloaded / total_bytes * 100.0) if total_bytes and total_bytes > 0 else 0.0
                            eta = ((total_bytes - downloaded) / speed) if (total_bytes and speed > 0) else None

                            cb_res = progress_callback({
                                "status": "DOWNLOADING",
                                "downloaded_bytes": downloaded,
                                "total_bytes": total_bytes or 0,
                                "progress": min(100.0, max(0.0, pct)),
                                "speed": speed,
                                "eta": eta,
                            })
                            if asyncio.iscoroutine(cb_res):
                                await cb_res

        # Atomic move to final file
        if final_file_path.exists():
            # If target exists, generate collision-free name
            stem = final_file_path.stem
            suffix = final_file_path.suffix
            counter = 1
            while final_file_path.exists():
                final_file_path = dest_dir_path / f"{stem}_{counter}{suffix}"
                counter += 1

        part_file_path.replace(final_file_path)

        final_cb_res = progress_callback({
            "status": "COMPLETED",
            "downloaded_bytes": final_file_path.stat().st_size,
            "total_bytes": final_file_path.stat().st_size,
            "progress": 100.0,
            "speed": 0.0,
            "eta": 0,
            "output_path": str(final_file_path.resolve())
        })
        if asyncio.iscoroutine(final_cb_res):
            await final_cb_res

        return str(final_file_path.resolve())

