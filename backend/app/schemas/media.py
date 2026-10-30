import datetime
from enum import Enum
from typing import Optional, List, Any, Dict
from pydantic import BaseModel, Field, ConfigDict

class AnalysisStatus(str, Enum):
    AVAILABLE = "AVAILABLE"
    SOURCE_ACCESS_CHALLENGE = "SOURCE_ACCESS_CHALLENGE"
    MEDIA_UNAVAILABLE = "MEDIA_UNAVAILABLE"
    RATE_LIMITED = "RATE_LIMITED"
    UNSUPPORTED = "UNSUPPORTED"
    NETWORK_TIMEOUT = "NETWORK_TIMEOUT"
    FAILED = "FAILED"

class FormatOption(BaseModel):
    format_id: str
    ext: str
    resolution: str
    height: Optional[int] = None
    vcodec: Optional[str] = None
    acodec: Optional[str] = None
    filesize: Optional[int] = None
    filesize_approx: Optional[int] = None
    fps: Optional[float] = None
    quality_label: str

class MediaMetadata(BaseModel):
    url: str
    canonical_url: Optional[str] = None
    media_id: Optional[str] = None
    title: str
    creator: Optional[str] = None
    thumbnail: Optional[str] = None
    duration: Optional[float] = None
    source: str # youtube, direct, vimeo, soundcloud, etc.
    is_playlist: bool = False
    playlist_count: Optional[int] = None
    playlist_entries: Optional[List["MediaMetadata"]] = None
    available_qualities: List[str] = Field(default_factory=list) # e.g. ["2160p", "1080p", "720p", "audio"]
    formats: List[FormatOption] = Field(default_factory=list)
    is_valid: bool = True
    error: Optional[str] = None

    # Normalized error classification and resilience fields
    analysis_status: AnalysisStatus = AnalysisStatus.AVAILABLE
    error_code: Optional[str] = None
    user_message: Optional[str] = None
    suggested_action: Optional[str] = None
    is_selectable: bool = True
    raw_error: Optional[str] = None

class UrlAnalysisRequest(BaseModel):
    url: str
    allow_localhost: bool = False

class BulkAnalysisRequest(BaseModel):
    urls: List[str]
    allow_localhost: bool = False

class CreateDownloadRequest(BaseModel):
    url: str
    title: Optional[str] = None
    creator: Optional[str] = None
    thumbnail: Optional[str] = None
    duration: Optional[float] = None
    quality: str = "original" # original, 2160p, 1440p, 1080p, 720p, 480p, audio
    format: str = "mp4" # mp4, mkv, mp3, m4a, flac, opus, wav
    audio_bitrate: Optional[str] = "320k" # 320k, 256k, 192k, 128k
    destination_folder: Optional[str] = None
    batch_id: Optional[str] = None

class CreateBatchRequest(BaseModel):
    name: str = "Batch Download"
    items: List[CreateDownloadRequest]
    selected_preset: str = "original" # original, high_mp4, audio_only, data_saver, custom
    destination_folder: Optional[str] = None
    concurrency: int = 3
    auto_start: bool = True
    skip_duplicates: bool = True

class JobResponse(BaseModel):
    id: str
    batch_id: Optional[str]
    source_id: str
    source_url: str
    canonical_url: Optional[str]
    media_id: Optional[str]
    title: str
    creator: Optional[str]
    thumbnail_url: Optional[str]
    duration: Optional[float]
    selected_quality: str
    actual_quality: Optional[str]
    selected_format: str
    actual_format: Optional[str]
    audio_bitrate: Optional[str]
    destination_dir: str
    filename: Optional[str]
    output_path: Optional[str]
    file_size: int
    downloaded_bytes: int
    status: str
    progress: float
    speed: float
    eta: Optional[float]
    error_code: Optional[str]
    error_message: Optional[str]
    retry_count: int
    max_retries: int
    queue_position: int
    media_type: Optional[str] = "video"
    image_width: Optional[int] = None
    image_height: Optional[int] = None
    mime_type: Optional[str] = None
    image_format: Optional[str] = None
    source_variant: Optional[str] = None
    original_resolution_verified: Optional[bool] = False
    content_hash: Optional[str] = None
    download_engine: Optional[str] = None
    created_at: datetime.datetime
    started_at: Optional[datetime.datetime]
    completed_at: Optional[datetime.datetime]

    model_config = ConfigDict(from_attributes=True)

class BatchResponse(BaseModel):
    id: str
    name: str
    total_items: int
    completed_items: int
    failed_items: int
    skipped_items: int
    selected_preset: str
    destination_folder: str
    concurrency: int
    status: str
    created_at: datetime.datetime
    completed_at: Optional[datetime.datetime]
    jobs: Optional[List[JobResponse]] = None

    model_config = ConfigDict(from_attributes=True)

class DownloadHistoryResponse(BaseModel):
    id: int
    job_id: str
    media_identifier: Optional[str]
    title: str
    output_path: str
    file_size: int
    format: str
    quality: str
    duration: Optional[float]
    source_url: str
    completed_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)

class SystemStatusResponse(BaseModel):
    app_name: str
    version: str
    ffmpeg_installed: bool
    ffmpeg_version: Optional[str]
    ffprobe_installed: bool
    active_downloads: int
    queued_downloads: int
    completed_downloads: int
    failed_downloads: int
    concurrency: int
    default_destination: str
    storage_free_bytes: int
    storage_total_bytes: int

class ExtractorHealthResponse(BaseModel):
    ytdlp_version: str
    ytdlp_operational: bool
    ejs_installed: bool = False
    ejs_version: Optional[str] = None
    js_runtime_configured: str
    node_detected: bool
    node_version: Optional[str] = None
    node_path: Optional[str] = None
    deno_detected: bool
    deno_version: Optional[str] = None
    deno_path: Optional[str] = None
    ffmpeg_detected: bool
    ffmpeg_version: Optional[str] = None
    detected_browsers: List[str] = Field(default_factory=list)
    cookies_file_present: bool = False
    cookies_file_path: Optional[str] = None
    auth_mode: str = "none"
    browser_auth_enabled: bool = False
    browser_auth_approved: bool = False
    selected_browser: Optional[str] = None
    browser_lock_detected: bool = False
    recent_access_challenges: int = 0
    notes: List[str] = Field(default_factory=list)

class ConnectBrowserRequest(BaseModel):
    browser: str = "chrome"
    user_approved: bool = False
    acknowledge_disclaimer: bool = False

class AuthStatusResponse(BaseModel):
    auth_mode: str = "none"
    selected_browser: Optional[str] = None
    user_approved: bool = False
    is_connected: bool = False
    browser_lock_detected: bool = False
    lock_reason: Optional[str] = None
    diagnostic_message: Optional[str] = None
    disclaimer: str = (
        "Authentication uses local browser session data strictly on this machine. "
        "Credentials are never transmitted, logged, or exported. "
        "Authentication cannot bypass DRM, copyright restrictions, or private memberships without access."
    )

class SettingsUpdateRequest(BaseModel):
    default_destination: Optional[str] = None
    default_quality: Optional[str] = None
    default_format: Optional[str] = None
    concurrency: Optional[int] = None
    max_retries: Optional[int] = None
    auto_organize: Optional[bool] = None
    prefer_mp4: Optional[bool] = None
    speed_limit_kbps: Optional[int] = None

# ==================== Image Schemas ====================

class ImageItemSchema(BaseModel):
    url: str
    resolved_url: str
    filename: str
    width: Optional[int] = None
    height: Optional[int] = None
    file_size: Optional[int] = None
    format: str = "jpg"
    mime_type: str = "image/jpeg"
    orientation: str = "Unknown"
    aspect_ratio: Optional[str] = None
    source: str = "direct"
    is_valid: bool = True
    error: Optional[str] = None
    preview_url: Optional[str] = None

class ImageAnalyzeRequest(BaseModel):
    urls: List[str]

class PageDiscoverRequest(BaseModel):
    url: str
    min_width: int = 80
    min_height: int = 80
    include_inline: bool = False

class CreateImageItemRequest(BaseModel):
    url: str
    resolved_url: Optional[str] = None
    filename: Optional[str] = None
    title: Optional[str] = None
    target_format: Optional[str] = "original"
    width: Optional[int] = None
    height: Optional[int] = None
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    source_variant: Optional[str] = None
    original_verified: Optional[bool] = False

class CreateImageBatchRequest(BaseModel):
    name: str = "Image Batch"
    items: List[CreateImageItemRequest]
    destination_folder: Optional[str] = None
    concurrency: int = 10
    target_format: str = "original" # original, jpg, png, webp
    preserve_metadata: bool = True
    auto_start: bool = True
    skip_duplicates: bool = True

class ExportZipRequest(BaseModel):
    job_ids: Optional[List[str]] = None
    batch_id: Optional[str] = None
    zip_name: Optional[str] = None

# ==================== Performance Schemas ====================

class PerformanceSettingsSchema(BaseModel):
    mode: str = "balanced" # stable, balanced, fast, maximum, custom
    global_max_workers: int = 20
    concurrency: int = 10
    image_workers: int = 10
    video_workers: int = 3
    per_host_limit: int = 4
    speed_limit_kbps: int = 0 # 0 = unlimited

class PerformanceStatusResponse(BaseModel):
    mode: str
    concurrency: int
    global_max_workers: int
    active_workers: int
    active_images: int
    active_videos: int
    speed_bytes_sec: float
    speed_mbs: float
    speed_mbps: float
    formatted_speed: str
    queued_jobs: int
    completed_jobs: int
    failed_jobs: int


