import asyncio
import hashlib
import io
import logging
import os
import re
import urllib.parse
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any, Callable
import httpx
from PIL import Image
from bs4 import BeautifulSoup

from app.core.config import settings
from app.utils.security import sanitize_filename, validate_url

logger = logging.getLogger("SaveXa.ImageDownloader")

IMAGE_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".tiff", ".tif", ".bmp", ".svg"
}

class ImageMetadata:
    def __init__(
        self,
        url: str,
        resolved_url: str,
        filename: str,
        width: Optional[int] = None,
        height: Optional[int] = None,
        file_size: Optional[int] = None,
        format: str = "jpg",
        mime_type: str = "image/jpeg",
        orientation: str = "Unknown",
        aspect_ratio: Optional[str] = None,
        source: str = "direct",
        is_valid: bool = True,
        error: Optional[str] = None,
        preview_url: Optional[str] = None,
    ):
        self.url = url
        self.resolved_url = resolved_url
        self.filename = filename
        self.width = width
        self.height = height
        self.file_size = file_size
        self.format = format.lower()
        self.mime_type = mime_type
        self.orientation = orientation
        self.aspect_ratio = aspect_ratio
        self.source = source
        self.is_valid = is_valid
        self.error = error
        self.preview_url = preview_url or resolved_url

    def to_dict(self) -> dict[str, Any]:
        return {
            "url": self.url,
            "resolved_url": self.resolved_url,
            "filename": self.filename,
            "width": self.width,
            "height": self.height,
            "file_size": self.file_size,
            "format": self.format,
            "mime_type": self.mime_type,
            "orientation": self.orientation,
            "aspect_ratio": self.aspect_ratio,
            "source": self.source,
            "is_valid": self.is_valid,
            "error": self.error,
            "preview_url": self.preview_url,
        }

class ImageDownloader:
    """High-speed async HTTPX image download engine supporting 20 workers and original quality preservation."""

    def __init__(self):
        self.limits = httpx.Limits(max_connections=60, max_keepalive_connections=30, keepalive_expiry=30.0)
        self.client: Optional[httpx.AsyncClient] = None
        self._host_semaphores: Dict[str, asyncio.Semaphore] = {}
        self.per_host_limit = settings.DEFAULT_PER_HOST_LIMIT

    def get_client(self) -> httpx.AsyncClient:
        if self.client is None or self.client.is_closed:
            self.client = httpx.AsyncClient(
                limits=self.limits,
                timeout=httpx.Timeout(20.0, connect=8.0),
                follow_redirects=True,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
                    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                }
            )
        return self.client

    def get_host_semaphore(self, url: str) -> asyncio.Semaphore:
        try:
            host = urllib.parse.urlparse(url).netloc.lower()
        except Exception:
            host = "default"
        if host not in self._host_semaphores:
            self._host_semaphores[host] = asyncio.Semaphore(self.per_host_limit)
        return self._host_semaphores[host]

    def resolve_original_url(self, url: str) -> str:
        """Resolve CDN / downscaled thumbnail URLs into the true full-resolution original variant."""
        parsed = urllib.parse.urlparse(url)
        netloc = parsed.netloc.lower()
        path = parsed.path

        # 1. Wikimedia Commons: strip /thumb/ and the trailing scaled filename
        if "wikimedia.org" in netloc and "/thumb/" in path:
            # Format: .../wikipedia/commons/thumb/a/ab/File.jpg/800px-File.jpg
            # Original: .../wikipedia/commons/a/ab/File.jpg
            clean_path = path.replace("/thumb/", "/")
            clean_path = re.sub(r'/[^/]+$', '', clean_path)
            return urllib.parse.urlunparse(parsed._replace(path=clean_path, query=""))

        # 2. Twitter / X images: name=small / name=large -> name=orig
        if "twimg.com" in netloc:
            qs = urllib.parse.parse_qs(parsed.query)
            if "format" in qs:
                fmt = qs["format"][0]
                return f"{parsed.scheme}://{parsed.netloc}{parsed.path}?format={fmt}&name=orig"
            return re.sub(r':(small|medium|large|thumb)$', ':orig', url)

        # 3. Unsplash: remove downsampling query parameters
        if "unsplash.com" in netloc:
            clean_query = re.sub(r'&?(w|h|fit|crop|q)=\d+', '', parsed.query).strip('&')
            return urllib.parse.urlunparse(parsed._replace(query=clean_query))

        # 4. Reddit: preview.redd.it -> i.redd.it
        if "preview.redd.it" in netloc:
            return urllib.parse.urlunparse(parsed._replace(netloc="i.redd.it", query=""))

        # 5. WordPress / Blog thumbnail dimension stripping: e.g. image-800x600.jpg -> image.jpg
        m = re.search(r'(-\d{3,4}x\d{3,4})(\.[a-zA-Z]{3,4})$', path)
        if m:
            clean_path = path[:m.start(1)] + m.group(2)
            return urllib.parse.urlunparse(parsed._replace(path=clean_path))

        return url

    async def analyze_url(self, url: str) -> ImageMetadata:
        """Inspect headers and first bytes to determine format, dimensions, orientation without full download."""
        is_valid, reason = validate_url(url, allow_localhost_for_testing=True)
        if not is_valid:
            return ImageMetadata(
                url=url,
                resolved_url=url,
                filename="invalid",
                is_valid=False,
                error=reason
            )

        resolved_url = self.resolve_original_url(url)
        parsed = urllib.parse.urlparse(resolved_url)
        raw_name = os.path.basename(urllib.parse.unquote(parsed.path)) or "image.jpg"
        clean_filename = sanitize_filename(raw_name)

        client = self.get_client()
        sem = self.get_host_semaphore(resolved_url)

        width: Optional[int] = None
        height: Optional[int] = None
        file_size: Optional[int] = None
        format_name = "jpg"
        mime_type = "image/jpeg"

        async with sem:
            try:
                # First attempt fast HEAD request
                head_resp = await client.head(resolved_url)
                if head_resp.status_code < 400:
                    cl = head_resp.headers.get("content-length")
                    if cl and cl.isdigit():
                        file_size = int(cl)
                    ct = head_resp.headers.get("content-type", "").lower()
                    if ct:
                        mime_type = ct.split(";")[0]

                # Stream initial 64 KiB to extract accurate dimensions via Pillow
                async with client.stream("GET", resolved_url, headers={"Range": "bytes=0-65535"}) as resp:
                    if resp.status_code in (200, 206):
                        chunk = await resp.aread()
                        if not file_size and "content-length" in resp.headers:
                            cl = resp.headers["content-length"]
                            if cl.isdigit() and resp.status_code == 200:
                                file_size = int(cl)

                        # Decodability check with Pillow
                        if chunk:
                            try:
                                img = Image.open(io.BytesIO(chunk))
                                width, height = img.size
                                format_name = img.format.lower() if img.format else "jpg"
                                if format_name == "jpeg":
                                    format_name = "jpg"
                            except Exception:
                                # In case partial chunk was insufficient for format header, try extension
                                ext = Path(clean_filename).suffix.lstrip(".").lower()
                                if ext in ("jpg", "jpeg", "png", "webp", "avif", "gif", "svg", "bmp"):
                                    format_name = "jpg" if ext == "jpeg" else ext

            except Exception as e:
                logger.warning(f"Metadata probe fallback for {url}: {e}")
                ext = Path(clean_filename).suffix.lstrip(".").lower()
                if ext:
                    format_name = ext

        # Calculate orientation & aspect ratio
        orientation = "Unknown"
        aspect_ratio = None
        if width and height:
            ratio = width / height
            if ratio > 1.05:
                orientation = "Landscape"
            elif ratio < 0.95:
                orientation = "Portrait"
            else:
                orientation = "Square"
            
            # Common aspect ratios
            if abs(ratio - 16/9) < 0.05:
                aspect_ratio = "16:9"
            elif abs(ratio - 4/3) < 0.05:
                aspect_ratio = "4:3"
            elif abs(ratio - 1.0) < 0.05:
                aspect_ratio = "1:1"
            elif abs(ratio - 3/2) < 0.05:
                aspect_ratio = "3:2"
            elif abs(ratio - 9/16) < 0.05:
                aspect_ratio = "9:16"
            else:
                aspect_ratio = f"{ratio:.2f}:1"

        # Ensure correct extension on filename
        stem = Path(clean_filename).stem
        final_filename = f"{stem}.{format_name}"

        return ImageMetadata(
            url=url,
            resolved_url=resolved_url,
            filename=final_filename,
            width=width,
            height=height,
            file_size=file_size,
            format=format_name,
            mime_type=mime_type,
            orientation=orientation,
            aspect_ratio=aspect_ratio,
            source=parsed.netloc or "web",
            is_valid=True,
            preview_url=resolved_url,
        )

    async def discover_page_images(self, page_url: str) -> List[ImageMetadata]:
        """Fetch compatible public webpage and discover all embedded image assets with original resolutions."""
        is_valid, reason = validate_url(page_url, allow_localhost_for_testing=True)
        if not is_valid:
            raise ValueError(reason)

        client = self.get_client()
        resp = await client.get(page_url, timeout=15.0)
        if resp.status_code >= 400:
            raise RuntimeError(f"Webpage request failed with status {resp.status_code}")

        soup = BeautifulSoup(resp.text, "html.parser")
        candidate_urls: List[str] = []

        # 1. Open Graph & Twitter Social high-res cards
        for meta in soup.find_all("meta"):
            prop = meta.get("property") or meta.get("name") or ""
            if prop in ("og:image", "og:image:secure_url", "twitter:image", "twitter:image:src"):
                content = meta.get("content")
                if content:
                    candidate_urls.append(urllib.parse.urljoin(page_url, content.strip()))

        # 2. <img> tags with src, srcset, data-src
        for img in soup.find_all("img"):
            # Check srcset for highest resolution
            srcset = img.get("srcset")
            if srcset:
                parts = [p.strip() for p in srcset.split(",") if p.strip()]
                best_url = None
                best_val = 0
                for part in parts:
                    tokens = part.split()
                    if tokens:
                        u = tokens[0]
                        val = 1
                        if len(tokens) > 1:
                            m = re.search(r'(\d+)', tokens[1])
                            if m:
                                val = int(m.group(1))
                        if val > best_val:
                            best_val = val
                            best_url = u
                if best_url:
                    candidate_urls.append(urllib.parse.urljoin(page_url, best_url))

            # Check lazy-load attributes
            for attr in ("src", "data-src", "data-original", "data-lazy-src", "data-highres"):
                val = img.get(attr)
                if val and not val.startswith("data:image"):
                    candidate_urls.append(urllib.parse.urljoin(page_url, val.strip()))

        # 3. Direct image links in <a> tags
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            parsed_href = urllib.parse.urlparse(href)
            ext = Path(parsed_href.path).suffix.lower()
            if ext in IMAGE_EXTENSIONS:
                candidate_urls.append(urllib.parse.urljoin(page_url, href))

        # Deduplicate candidates while preserving order
        unique_candidates: List[str] = []
        seen = set()
        for c in candidate_urls:
            # Filter out 1x1 tracking pixels, icons, analytics
            low = c.lower()
            if any(junk in low for junk in ("pixel", "spacer", "1x1", "tracking", "analytics", "favicon")):
                continue
            if c not in seen and (c.startswith("http://") or c.startswith("https://")):
                seen.add(c)
                unique_candidates.append(c)

        # Bounded metadata inspection (up to 50 discovered images per page)
        bounded = unique_candidates[:50]
        sem = asyncio.Semaphore(10)

        async def analyze_bound(u: str) -> ImageMetadata:
            async with sem:
                return await self.analyze_url(u)

        results = await asyncio.gather(*(analyze_bound(u) for u in bounded))
        return [r for r in results if r.is_valid]

    async def download_image(
        self,
        job_id: str,
        url: str,
        destination_dir: str,
        filename: Optional[str] = None,
        output_format: Optional[str] = "original",
        progress_callback: Optional[Callable[[dict[str, Any]], None]] = None,
        cancel_event: Optional[asyncio.Event] = None,
    ) -> str:
        """
        High-performance streaming download with 256 KiB chunks,
        per-host concurrency control, Pillow raster verification, and atomic file move.
        """
        dest_path = Path(destination_dir)
        dest_path.mkdir(parents=True, exist_ok=True)

        resolved_url = self.resolve_original_url(url)
        client = self.get_client()
        sem = self.get_host_semaphore(resolved_url)

        if not filename:
            parsed = urllib.parse.urlparse(resolved_url)
            base = os.path.basename(urllib.parse.unquote(parsed.path)) or "image.jpg"
            filename = sanitize_filename(base)

        final_path = dest_path / filename
        part_path = dest_path / f"{filename}.part"

        if progress_callback:
            progress_callback({
                "status": "CONNECTING",
                "downloaded_bytes": 0,
                "total_bytes": 0,
                "progress": 0.0,
                "speed": 0.0,
                "eta": None,
            })

        async with sem:
            async with client.stream("GET", resolved_url) as resp:
                if resp.status_code >= 400:
                    raise RuntimeError(f"HTTP image request failed with status {resp.status_code}")

                total_bytes = None
                cl = resp.headers.get("content-length")
                if cl and cl.isdigit():
                    total_bytes = int(cl)

                downloaded = 0
                last_time = asyncio.get_event_loop().time()
                bytes_since_last = 0
                hasher = hashlib.sha256()

                # Stream response with 256 KiB buffered chunks for maximum network & disk throughput
                with open(part_path, "wb") as f:
                    async for chunk in resp.aiter_bytes(chunk_size=262144): # 256 KiB
                        if cancel_event and cancel_event.is_set():
                            raise asyncio.CancelledError("Download cancelled by user")

                        f.write(chunk)
                        hasher.update(chunk)
                        chunk_len = len(chunk)
                        downloaded += chunk_len
                        bytes_since_last += chunk_len

                        now = asyncio.get_event_loop().time()
                        delta = now - last_time
                        if delta >= 0.25:
                            speed = bytes_since_last / delta
                            last_time = now
                            bytes_since_last = 0
                            pct = (downloaded / total_bytes * 100.0) if (total_bytes and total_bytes > 0) else 0.0
                            eta = ((total_bytes - downloaded) / speed) if (total_bytes and speed > 0) else None

                            if progress_callback:
                                progress_callback({
                                    "status": "DOWNLOADING",
                                    "downloaded_bytes": downloaded,
                                    "total_bytes": total_bytes or downloaded,
                                    "progress": min(99.0, max(0.0, pct)),
                                    "speed": speed,
                                    "eta": eta,
                                })

        # Image File Integrity & Dimensions Validation using Pillow
        content_hash = hasher.hexdigest()
        ext = part_path.suffix.lower()

        actual_width: Optional[int] = None
        actual_height: Optional[int] = None
        actual_format = ext.lstrip(".")

        if ext != ".svg":
            try:
                with Image.open(part_path) as img:
                    img.verify() # Validates header and stream integrity
                # Reopen to read dimensions safely
                with Image.open(part_path) as img:
                    actual_width, actual_height = img.size
                    actual_format = img.format.lower() if img.format else actual_format
            except Exception as e:
                part_path.unlink(missing_ok=True)
                raise RuntimeError(f"Downloaded file failed image integrity validation: {e}")

        # Optional conversion if requested and not "original"
        if output_format and output_format not in ("original", "preserve", actual_format):
            target_ext = f".{output_format.lower()}"
            converted_path = dest_path / f"{final_path.stem}{target_ext}"
            try:
                with Image.open(part_path) as img:
                    # Handle RGBA to RGB for JPEG
                    if target_ext in (".jpg", ".jpeg") and img.mode in ("RGBA", "P"):
                        img = img.convert("RGB")
                    img.save(converted_path, quality=95)
                part_path.unlink(missing_ok=True)
                final_path = converted_path
            except Exception as e:
                logger.warning(f"Conversion to {output_format} failed, preserving original: {e}")
                part_path.replace(final_path)
        else:
            # Handle potential file collision
            counter = 1
            orig_stem = final_path.stem
            orig_suffix = final_path.suffix
            while final_path.exists():
                final_path = dest_path / f"{orig_stem}_{counter}{orig_suffix}"
                counter += 1
            part_path.replace(final_path)

        final_size = final_path.stat().st_size

        if progress_callback:
            progress_callback({
                "status": "COMPLETED",
                "downloaded_bytes": final_size,
                "total_bytes": final_size,
                "progress": 100.0,
                "speed": 0.0,
                "eta": 0,
                "output_path": str(final_path.resolve()),
                "content_hash": content_hash,
                "image_width": actual_width,
                "image_height": actual_height,
                "actual_format": actual_format,
            })

        return str(final_path.resolve())

    def verify_image(self, file_path: str) -> Tuple[bool, Optional[int], Optional[int], Optional[str]]:
        """Verify raster integrity and extract dimensions and format."""
        try:
            with Image.open(file_path) as img:
                img.verify()
            with Image.open(file_path) as img:
                return True, img.width, img.height, img.format.lower() if img.format else None
        except Exception:
            return False, None, None, None

    def convert_image(self, file_path: str, target_format: str) -> str:
        """Convert image to target format (e.g. jpg, png, webp) preserving quality."""
        p = Path(file_path)
        out_ext = f".{target_format.lower().lstrip('.')}"
        out_path = p.with_suffix(out_ext)
        with Image.open(p) as img:
            if out_ext in (".jpg", ".jpeg") and img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            img.save(out_path, quality=95)
        return str(out_path.resolve())

image_downloader = ImageDownloader()
