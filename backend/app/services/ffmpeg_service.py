import asyncio
import json
import os
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any

from app.core.config import settings

class FFmpegService:
    def __init__(self):
        self.ffmpeg_path = settings.FFMPEG_PATH
        self.ffprobe_path = settings.FFPROBE_PATH

    def is_ffmpeg_available(self) -> bool:
        if not self.ffmpeg_path:
            return False
        try:
            res = subprocess.run([self.ffmpeg_path, "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            return res.returncode == 0
        except Exception:
            return False

    def is_ffprobe_available(self) -> bool:
        if not self.ffprobe_path:
            return False
        try:
            res = subprocess.run([self.ffprobe_path, "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            return res.returncode == 0
        except Exception:
            return False

    def get_ffmpeg_version(self) -> Optional[str]:
        try:
            res = subprocess.run([self.ffmpeg_path, "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if res.returncode == 0:
                first_line = res.stdout.splitlines()[0]
                return first_line
        except Exception:
            pass
        return None

    async def inspect_file(self, file_path: str) -> Dict[str, Any]:
        """Inspect media file using ffprobe to verify streams, resolution, and codecs."""
        if not self.is_ffprobe_available():
            # Fallback basic stats from OS filesystem
            p = Path(file_path)
            return {
                "file_size": p.stat().st_size if p.exists() else 0,
                "verified": False,
                "ffprobe_missing": True,
            }

        cmd = [
            self.ffprobe_path,
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            file_path
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            return {
                "verified": False,
                "error": stderr.decode("utf-8", errors="replace"),
                "file_size": Path(file_path).stat().st_size if Path(file_path).exists() else 0
            }

        try:
            data = json.loads(stdout.decode("utf-8"))
            streams = data.get("streams", [])
            format_info = data.get("format", {})

            video_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
            audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), None)

            width = video_stream.get("width") if video_stream else None
            height = video_stream.get("height") if video_stream else None
            vcodec = video_stream.get("codec_name") if video_stream else None
            acodec = audio_stream.get("codec_name") if audio_stream else None
            duration = float(format_info.get("duration", 0))

            return {
                "verified": True,
                "file_size": int(format_info.get("size", Path(file_path).stat().st_size)),
                "duration": duration,
                "width": width,
                "height": height,
                "resolution": f"{width}x{height}" if width and height else None,
                "vcodec": vcodec,
                "acodec": acodec,
                "format_name": format_info.get("format_name"),
                "bit_rate": format_info.get("bit_rate"),
            }
        except Exception as e:
            return {
                "verified": False,
                "error": f"Failed to parse ffprobe output: {e}",
                "file_size": Path(file_path).stat().st_size if Path(file_path).exists() else 0
            }

    async def convert_audio(self, input_path: str, output_path: str, target_format: str, bitrate: str = "320k") -> bool:
        """Convert any audio or extract audio from video using FFmpeg."""
        cmd = [
            self.ffmpeg_path,
            "-y",
            "-i", input_path,
            "-vn",
            "-b:a", bitrate,
            output_path
        ]
        proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        await proc.communicate()
        return proc.returncode == 0

    async def trim_media(self, input_path: str, output_path: str, start_time: str, end_time: str) -> bool:
        """Trim media file using start and end timestamps."""
        cmd = [
            self.ffmpeg_path,
            "-y",
            "-ss", start_time,
            "-to", end_time,
            "-i", input_path,
            "-c", "copy",
            output_path
        ]
        proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        await proc.communicate()
        return proc.returncode == 0

ffmpeg_service = FFmpegService()

