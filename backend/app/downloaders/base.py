from abc import ABC, abstractmethod
from typing import Callable, Any, Optional
from app.schemas.media import MediaMetadata

class BaseDownloader(ABC):
    @abstractmethod
    def can_handle(self, url: str) -> bool:
        """Return True if this downloader can handle the given URL."""
        pass

    @abstractmethod
    async def analyze(self, url: str) -> MediaMetadata:
        """Analyze URL and extract media metadata, available formats, etc."""
        pass

    @abstractmethod
    async def download(
        self,
        job_id: str,
        url: str,
        destination_dir: str,
        quality: str,
        format_type: str,
        audio_bitrate: Optional[str],
        progress_callback: Callable[[dict[str, Any]], None],
        cancel_event: Any = None,
    ) -> str:
        """Execute download and return path to the finalized downloaded file."""
        pass

