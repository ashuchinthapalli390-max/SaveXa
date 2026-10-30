import asyncio
import os
import re
import shutil
from pathlib import Path
from typing import Callable, Any, Optional
from urllib.parse import urlparse
import yt_dlp

from app.core.config import settings
from app.downloaders.base import BaseDownloader
from app.schemas.media import MediaMetadata, FormatOption, AnalysisStatus
from app.utils.security import sanitize_filename

def extract_fallback_title(url: str) -> tuple[str, str]:
    """Extract a friendly fallback title and source from URL."""
    yt_match = re.search(r'(?:v=|\/embed\/|\/watch\?v=|\/v\/|youtu\.be\/|\/shorts\/)([a-zA-Z0-9_-]{11})', url)
    if yt_match:
        return f"YouTube Video ({yt_match.group(1)})", "youtube"
    
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.replace("www.", "")
        path_name = Path(parsed.path).name
        src = domain.split(".")[0] if "." in domain else domain
        if path_name:
            return f"{domain}: {path_name[:32]}", src
        return f"{domain} Media", src
    except Exception:
        return "Preserved Media Item", "web"

def classify_ytdlp_error(url: str, err: Exception) -> tuple[AnalysisStatus, str, str, str]:
    """
    Classify yt-dlp exceptions into normalized status, error_code, user_message, and suggested_action.
    Never exposes raw unhandled Python tracebacks directly in the primary user message.
    """
    err_str = str(err)
    lower_err = err_str.lower()
    
    if any(k in lower_err for k in ["could not copy chrome cookie database", "could not copy", "cookie database"]):
        return (
            AnalysisStatus.SOURCE_ACCESS_CHALLENGE,
            "BROWSER_COOKIE_LOCKED",
            "Google Chrome is actively running and locking its cookie session on Windows.",
            "Close Google Chrome briefly to allow yt-dlp to access the session, or export cookies to data/cookies.txt."
        )

    if any(k in lower_err for k in ["confirm you're not a bot", "confirm youre not a bot", "bot", "captcha", "sign in to confirm"]):
        return (
            AnalysisStatus.SOURCE_ACCESS_CHALLENGE,
            "SOURCE_ACCESS_CHALLENGE",
            "YouTube anti-bot verification required. Automated requests from this network require interactive sign-in or session cookies.",
            "Link preserved. You can open directly in your browser, or configure cookies.txt in the data folder."
        )
    if any(k in lower_err for k in ["429", "too many requests", "rate limit", "temporarily blocked"]):
        return (
            AnalysisStatus.RATE_LIMITED,
            "RATE_LIMITED",
            "Source provider temporarily rate-limited automated queries (HTTP 429). Requests paused to protect network connection.",
            "Link preserved. Wait a few moments before retrying this source."
        )
    if any(k in lower_err for k in ["georestricted", "not available in your country", "blocked in your region", "country"]):
        return (
            AnalysisStatus.MEDIA_UNAVAILABLE,
            "GEO_RESTRICTED",
            "This media is restricted in your geographic region.",
            "Media cannot be accessed from your current location."
        )
    if any(k in lower_err for k in ["private video", "this video is private", "members-only", "requires a subscription", "login required"]):
        return (
            AnalysisStatus.MEDIA_UNAVAILABLE,
            "MEDIA_PRIVATE",
            "This media is private, members-only, or requires authorization to view.",
            "Verify visibility permissions or sign-in credentials."
        )
    if any(k in lower_err for k in ["premieres in", "live event will begin", "live stream"]):
        return (
            AnalysisStatus.MEDIA_UNAVAILABLE,
            "UPCOMING_BROADCAST",
            "This live stream or premiere broadcast has not started yet.",
            "Retry after the broadcast has started."
        )
    if any(k in lower_err for k in ["video unavailable", "removed by the uploader", "account associated with this video has been terminated", "not available"]):
        return (
            AnalysisStatus.MEDIA_UNAVAILABLE,
            "MEDIA_UNAVAILABLE",
            "This video is unavailable or has been removed from the platform.",
            "Verify the source link is still active."
        )
    if any(k in lower_err for k in ["timed out", "timeout", "connection reset", "readtimeout", "connecttimeout"]):
        return (
            AnalysisStatus.NETWORK_TIMEOUT,
            "NETWORK_TIMEOUT",
            "Connection to the media host timed out.",
            "Check internet connection and try again."
        )
    if any(k in lower_err for k in ["unsupported url", "is not a valid url", "no suitable extractor"]):
        return (
            AnalysisStatus.UNSUPPORTED,
            "UNSUPPORTED_HOST",
            "This URL or hosting service is not recognized as a supported media source.",
            "Ensure the link points directly to a supported media platform or file."
        )

    # General extractor error
    return (
        AnalysisStatus.FAILED,
        "EXTRACTOR_ERROR",
        "Unable to extract media metadata from this link.",
        "Check technical details or verify the source link."
    )

class YtDlpDownloader(BaseDownloader):
    """Downloader for platforms supported by yt-dlp (YouTube, Vimeo, SoundCloud, Kick, etc.)."""

    def can_handle(self, url: str) -> bool:
        # yt-dlp handles broad web media sources
        return True

    def _get_common_opts(self) -> dict[str, Any]:
        opts: dict[str, Any] = {
            "quiet": True,
            "no_warnings": True,
            "nocheckcertificate": True,
            "ignoreerrors": False,
            "logtostderr": False,
            "windowsfilenames": True,
            "concurrent_fragment_downloads": 4,
            "buffersize": 1048576,
            "extractor_args": {
                "youtube": {
                    "player_client": ["android", "web"]
                }
            }
        }

        # Configure external JavaScript runtime (Deno and/or Node.js)
        deno_path = shutil.which("deno")
        if not deno_path:
            for p in [
                Path.home() / ".deno" / "bin" / "deno.exe",
                Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Packages" / "DenoLand.Deno_Microsoft.Winget.Source_8wekyb3d8bbwe" / "deno.exe",
                Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Links" / "deno.exe",
            ]:
                if p.is_file():
                    deno_path = str(p)
                    break

        node_path = shutil.which("node")

        runtimes = {}
        if deno_path:
            runtimes["deno"] = {"path": str(deno_path)}
        if node_path:
            runtimes["node"] = {"path": str(node_path)}
        if runtimes:
            opts["js_runtimes"] = runtimes

        # Check local source authentication (browser session or cookies.txt)
        from app.services.auth_service import auth_service
        auth_opts = auth_service.get_ytdlp_auth_opts()
        opts.update(auth_opts)

        if settings.FFMPEG_PATH and os.path.exists(settings.FFMPEG_PATH):
            opts["ffmpeg_location"] = settings.FFMPEG_PATH
        return opts

    async def analyze(self, url: str) -> MediaMetadata:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._sync_analyze, url)

    def _sync_analyze(self, url: str) -> MediaMetadata:
        ydl_opts = self._get_common_opts()
        ydl_opts["extract_flat"] = "in_playlist"

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                if not info:
                    return MediaMetadata(
                        url=url,
                        title="Unknown Media",
                        source="unknown",
                        is_valid=False,
                        error="Could not extract metadata from this source"
                    )

                is_playlist = info.get("_type") == "playlist" or "entries" in info
                if is_playlist:
                    entries = info.get("entries", [])
                    playlist_items = []
                    for entry in entries:
                        if not entry:
                            continue
                        playlist_items.append(
                            MediaMetadata(
                                url=entry.get("url") or entry.get("webpage_url") or url,
                                canonical_url=entry.get("webpage_url"),
                                media_id=str(entry.get("id", "")),
                                title=entry.get("title") or "Untitled Track",
                                creator=entry.get("uploader") or entry.get("channel"),
                                thumbnail=entry.get("thumbnail"),
                                duration=float(entry.get("duration") or 0),
                                source=info.get("extractor", "playlist"),
                                is_playlist=False,
                                is_valid=True
                            )
                        )

                    return MediaMetadata(
                        url=url,
                        canonical_url=info.get("webpage_url") or url,
                        media_id=str(info.get("id", "")),
                        title=info.get("title") or "Playlist",
                        creator=info.get("uploader") or info.get("channel"),
                        thumbnail=info.get("thumbnail"),
                        source=info.get("extractor", "playlist"),
                        is_playlist=True,
                        playlist_count=len(playlist_items),
                        playlist_entries=playlist_items,
                        available_qualities=["original", "1080p", "720p", "audio"],
                        is_valid=True
                    )

                # Single video / audio item
                formats_raw = info.get("formats", [])
                format_options = []
                qualities_set = set()

                for f in formats_raw:
                    height = f.get("height")
                    ext = f.get("ext", "mp4")
                    vcodec = f.get("vcodec")
                    acodec = f.get("acodec")

                    if height:
                        q_label = f"{height}p"
                        qualities_set.add(q_label)
                    elif vcodec == "none" and acodec != "none":
                        q_label = "audio"
                        qualities_set.add("audio")
                    else:
                        q_label = "Original"

                    format_options.append(
                        FormatOption(
                            format_id=str(f.get("format_id", "")),
                            ext=ext,
                            resolution=f"{f.get('width', '?')}x{height}" if height else "Audio Only",
                            height=height,
                            vcodec=vcodec,
                            acodec=acodec,
                            filesize=f.get("filesize"),
                            filesize_approx=f.get("filesize_approx"),
                            fps=f.get("fps"),
                            quality_label=q_label
                        )
                    )

                # Sort available qualities in descending order
                def sort_q(q):
                    if q == "audio":
                        return 0
                    nums = re.findall(r'\d+', q)
                    return int(nums[0]) if nums else 9999

                sorted_qualities = sorted(list(qualities_set), key=sort_q, reverse=True)
                if "original" not in sorted_qualities:
                    sorted_qualities.insert(0, "original")

                return MediaMetadata(
                    url=url,
                    canonical_url=info.get("webpage_url") or url,
                    media_id=str(info.get("id", "")),
                    title=info.get("title") or "Untitled Media",
                    creator=info.get("uploader") or info.get("channel"),
                    thumbnail=info.get("thumbnail"),
                    duration=float(info.get("duration") or 0),
                    source=info.get("extractor", "web"),
                    is_playlist=False,
                    available_qualities=sorted_qualities,
                    formats=format_options,
                    is_valid=True,
                    analysis_status=AnalysisStatus.AVAILABLE,
                    is_selectable=True,
                )
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
                error=user_msg,
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
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None,
            self._sync_download,
            job_id,
            url,
            destination_dir,
            quality,
            format_type,
            audio_bitrate,
            progress_callback,
            cancel_event,
        )

    def _sync_download(
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
        dest_path = Path(destination_dir)
        dest_path.mkdir(parents=True, exist_ok=True)

        downloaded_file_holder: list[str] = []

        # Check for existing completed file on disk matching video ID
        m_id = re.search(r"(?:v=|\/)([0-9A-Za-z_-]{11})", url)
        if m_id:
            vid = m_id.group(1)
            matching = [p for p in dest_path.glob(f"*{vid}*") if p.is_file() and p.stat().st_size > 1024]
            if matching:
                existing_file = matching[0]
                size = existing_file.stat().st_size
                logger.info(f"File for video {vid} already exists on disk: {existing_file.name}. Skipping download.")
                progress_callback({
                    "status": "COMPLETED",
                    "downloaded_bytes": size,
                    "total_bytes": size,
                    "progress": 100.0,
                    "speed": 0.0,
                    "eta": 0,
                    "output_path": str(existing_file.resolve()),
                })
                return str(existing_file.resolve())

        # Initial CONNECTING event
        progress_callback({
            "status": "CONNECTING",
            "downloaded_bytes": 0,
            "total_bytes": 0,
            "progress": 0.0,
            "speed": 0.0,
            "eta": None,
        })

        def ytdl_hook(d):
            if cancel_event and cancel_event.is_set():
                raise yt_dlp.utils.DownloadCancelled("Download cancelled by user")

            status = d.get("status")
            if status == "downloading":
                total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
                downloaded = d.get("downloaded_bytes", 0)
                speed = d.get("speed") or 0.0
                eta = d.get("eta")
                pct = 0.0
                if total > 0:
                    pct = min(100.0, max(0.0, downloaded / total * 100.0))

                progress_callback({
                    "status": "DOWNLOADING",
                    "downloaded_bytes": downloaded,
                    "total_bytes": total,
                    "progress": pct,
                    "speed": speed,
                    "eta": eta,
                })
            elif status == "finished":
                total = d.get("total_bytes") or d.get("downloaded_bytes") or 0
                progress_callback({
                    "status": "PROCESSING",
                    "downloaded_bytes": total,
                    "total_bytes": total,
                    "progress": 99.0,
                    "speed": 0.0,
                    "eta": 0,
                })
                filename = d.get("filename")
                if filename:
                    downloaded_file_holder.append(filename)

        def postprocessor_hook(d):
            if cancel_event and cancel_event.is_set():
                raise yt_dlp.utils.DownloadCancelled("Download cancelled by user")
            status = d.get("status")
            if status == "started":
                progress_callback({
                    "status": "PROCESSING",
                    "downloaded_bytes": 0,
                    "total_bytes": 0,
                    "progress": 99.0,
                    "speed": 0.0,
                    "eta": 0,
                })
            elif status == "finished":
                filename = d.get("info_dict", {}).get("filepath")
                if filename:
                    downloaded_file_holder.append(filename)

        ydl_opts = self._get_common_opts()
        ydl_opts["progress_hooks"] = [ytdl_hook]
        ydl_opts["postprocessor_hooks"] = [postprocessor_hook]
        ydl_opts["outtmpl"] = str(dest_path / "%(title).120B [%(id)s].%(ext)s")
        ydl_opts["updatetime"] = False

        # Build format selector based on Original Quality Preservation Engine
        is_audio_mode = quality == "audio" or format_type in ("mp3", "m4a", "wav", "flac", "opus")

        target_ext = format_type
        if is_audio_mode:
            ydl_opts["format"] = "bestaudio/best"
            target_ext = format_type if format_type in ("mp3", "m4a", "wav", "flac", "opus") else "mp3"
            postprocessors = [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": target_ext,
                "preferredquality": (audio_bitrate or "320").replace("k", ""),
            }]
            ydl_opts["postprocessors"] = postprocessors
        else:
            # Video quality selection
            if quality == "original" or quality == "best":
                ydl_opts["format"] = "bestvideo+bestaudio/best"
            elif quality in ("2160p", "4k"):
                ydl_opts["format"] = "bestvideo[height<=2160]+bestaudio/best[height<=2160]/best"
            elif quality == "1440p":
                ydl_opts["format"] = "bestvideo[height<=1440]+bestaudio/best[height<=1440]/best"
            elif quality == "1080p":
                ydl_opts["format"] = "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best"
            elif quality == "720p":
                ydl_opts["format"] = "bestvideo[height<=720]+bestaudio/best[height<=720]/best"
            elif quality == "480p":
                ydl_opts["format"] = "bestvideo[height<=480]+bestaudio/best[height<=480]/best"
            else:
                ydl_opts["format"] = "bestvideo+bestaudio/best"

            # Merge container
            if format_type in ("mp4", "mkv", "webm"):
                ydl_opts["merge_output_format"] = format_type
            else:
                ydl_opts["merge_output_format"] = "mp4"

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            if not info:
                raise RuntimeError("yt-dlp returned no info for download")

            # Determine final file path
            final_path = None
            try:
                prepared = Path(ydl.prepare_filename(info))
                candidates = [prepared]
                if is_audio_mode:
                    candidates.insert(0, prepared.with_suffix(f".{target_ext}"))
                elif format_type in ("mp4", "mkv", "webm"):
                    candidates.insert(0, prepared.with_suffix(f".{format_type}"))

                for cand in candidates:
                    if cand.exists():
                        final_path = str(cand.resolve())
                        break
            except Exception:
                pass

            if not final_path and downloaded_file_holder:
                for candidate in downloaded_file_holder:
                    cand_p = Path(candidate)
                    if cand_p.exists():
                        final_path = str(cand_p.resolve())
                        break
                    target_candidate = cand_p.with_suffix(f".{format_type}")
                    if target_candidate.exists():
                        final_path = str(target_candidate.resolve())
                        break

            if not final_path:
                files = sorted(dest_path.glob("*"), key=lambda p: p.stat().st_mtime, reverse=True)
                if files:
                    final_path = str(files[0].resolve())
                else:
                    raise RuntimeError("Download completed but output file could not be found")

            # Final success callback
            final_size = Path(final_path).stat().st_size
            progress_callback({
                "status": "COMPLETED",
                "downloaded_bytes": final_size,
                "total_bytes": final_size,
                "progress": 100.0,
                "speed": 0.0,
                "eta": 0,
                "output_path": final_path,
            })

            return final_path

