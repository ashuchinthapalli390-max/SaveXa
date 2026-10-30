import datetime
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database.connection import Base

def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)

class Batch(Base):
    __tablename__ = "batches"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    total_items = Column(Integer, default=0)
    completed_items = Column(Integer, default=0)
    failed_items = Column(Integer, default=0)
    skipped_items = Column(Integer, default=0)
    selected_preset = Column(String, default="original")
    destination_folder = Column(String, nullable=False)
    concurrency = Column(Integer, default=3)
    status = Column(String, default="pending", index=True) # pending, active, paused, completed, failed, cancelled
    created_at = Column(DateTime, default=utcnow)
    completed_at = Column(DateTime, nullable=True)

    jobs = relationship("DownloadJob", back_populates="batch", cascade="all, delete-orphan")

class DownloadJob(Base):
    __tablename__ = "download_jobs"

    id = Column(String, primary_key=True, index=True)
    batch_id = Column(String, ForeignKey("batches.id", ondelete="SET NULL"), nullable=True, index=True)
    media_type = Column(String, default="video", index=True) # video, image, audio, direct
    source_id = Column(String, default="direct") # direct, ytdlp, youtube, etc.
    source_url = Column(Text, nullable=False)
    canonical_url = Column(Text, nullable=True)
    media_id = Column(String, nullable=True, index=True)
    title = Column(String, nullable=False, default="Untitled Download")
    creator = Column(String, nullable=True)
    thumbnail_url = Column(Text, nullable=True)
    duration = Column(Float, nullable=True)
    selected_quality = Column(String, default="original") # original, 2160p, 1440p, 1080p, 720p, 480p, audio
    actual_quality = Column(String, nullable=True)
    selected_format = Column(String, default="mp4") # mp4, mkv, mp3, m4a, flac, opus, wav, jpg, png, webp
    actual_format = Column(String, nullable=True)
    audio_bitrate = Column(String, nullable=True) # 320k, 256k, 192k, 128k
    destination_dir = Column(String, nullable=False)
    filename = Column(String, nullable=True)
    output_path = Column(Text, nullable=True)
    file_size = Column(Integer, default=0)
    downloaded_bytes = Column(Integer, default=0)
    
    # Image specific attributes
    image_width = Column(Integer, nullable=True)
    image_height = Column(Integer, nullable=True)
    mime_type = Column(String, nullable=True)
    image_format = Column(String, nullable=True)
    source_variant = Column(String, nullable=True)
    original_resolution_verified = Column(Integer, default=1)
    content_hash = Column(String, nullable=True)
    download_engine = Column(String, default="direct") # httpx, ytdlp, direct, aria2
    last_byte_received_at = Column(DateTime, nullable=True)
    
    # State Machine
    status = Column(String, default="CREATED", index=True)
    # CREATED, PENDING_ANALYSIS, ANALYZING, READY, QUEUED, DOWNLOADING, PROCESSING, VERIFYING, COMPLETED, PAUSED, FAILED, CANCELLED, SKIPPED, STALLED
    
    progress = Column(Float, default=0.0) # 0 to 100
    speed = Column(Float, default=0.0) # bytes/sec
    eta = Column(Float, nullable=True) # remaining seconds
    error_code = Column(String, nullable=True)
    error_message = Column(Text, nullable=True)
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)
    queue_position = Column(Integer, default=0, index=True)
    
    created_at = Column(DateTime, default=utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    batch = relationship("Batch", back_populates="jobs")

class DownloadHistory(Base):
    __tablename__ = "download_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String, index=True)
    media_identifier = Column(String, nullable=True, index=True)
    media_type = Column(String, default="video", index=True) # video, image, audio, direct
    title = Column(String, nullable=False)
    thumbnail_url = Column(Text, nullable=True)
    dimensions = Column(String, nullable=True)
    output_path = Column(Text, nullable=False)
    file_size = Column(Integer, default=0)
    format = Column(String, default="mp4")
    quality = Column(String, default="original")
    duration = Column(Float, nullable=True)
    source_url = Column(Text, nullable=False)
    completed_at = Column(DateTime, default=utcnow)

class Setting(Base):
    __tablename__ = "settings"

    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False) # JSON or string
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

class JobEvent(Base):
    __tablename__ = "job_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String, index=True)
    event_type = Column(String, nullable=False) # PROGRESS, STATUS_CHANGE, ERROR, COMPLETED
    payload = Column(Text, nullable=False) # JSON string
    timestamp = Column(DateTime, default=utcnow)

