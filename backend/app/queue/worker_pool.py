import asyncio
import datetime
import json
import logging
import re
import time
import urllib.parse
from pathlib import Path
from typing import Dict, Any, Optional, Set, List
from fastapi import WebSocket
from sqlalchemy import select, update, func

from app.core.config import settings
from app.database.connection import AsyncSessionLocal
from app.downloaders.direct import DirectDownloader
from app.downloaders.ytdlp import YtDlpDownloader
from app.downloaders.image_downloader import image_downloader
from app.models.entities import DownloadJob, Batch, DownloadHistory, JobEvent, utcnow
from app.services.ffmpeg_service import ffmpeg_service

logger = logging.getLogger("SaveXa.WorkerPool")

class ConnectionManager:
    """Manages active WebSockets for real-time frontend updates."""
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    async def broadcast(self, message: dict):
        if not self.active_connections:
            return
        dead = []
        payload = json.dumps(message, default=str)
        for ws in self.active_connections:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.active_connections.discard(ws)

ws_manager = ConnectionManager()

class WorkerPool:
    """
    High-Speed Global 20-Worker Concurrency Architecture.
    Enforces global download budget, per-media quotas (images vs videos), per-host limits,
    real-time aggregate throughput tracking (MB/s and Mbps), and auto-optimization.
    """
    def __init__(self):
        self.concurrency = settings.DEFAULT_CONCURRENCY # 10 default, up to 20
        self.global_max_workers = settings.GLOBAL_MAX_WORKERS # 20
        self.image_workers = settings.DEFAULT_IMAGE_WORKERS # 10
        self.video_workers = settings.DEFAULT_VIDEO_WORKERS # 3
        self.per_host_limit = settings.DEFAULT_PER_HOST_LIMIT # 4
        self.download_mode = "balanced" # stable (4), balanced (10), fast (16), maximum (20), custom
        self.auto_optimize = False
        self.speed_limit = 0 # 0 for unlimited

        self.active_tasks: Dict[str, asyncio.Task] = {}
        self.cancel_events: Dict[str, asyncio.Event] = {}
        self._last_progress_timestamps: Dict[str, float] = {}
        self._last_activity_timestamps: Dict[str, float] = {}
        self._job_media_types: Dict[str, str] = {}
        self._job_hosts: Dict[str, str] = {}
        self._active_speeds: Dict[str, float] = {}
        self._speed_history: list[dict] = [] # 60-second rolling window

        self.direct_downloader = DirectDownloader()
        self.ytdlp_downloader = YtDlpDownloader()
        self.image_downloader = image_downloader

        self.dispatcher_task: Optional[asyncio.Task] = None
        self.metrics_task: Optional[asyncio.Task] = None
        self._running = False
        self._lock = asyncio.Lock()

    def set_concurrency(self, limit: int):
        self.concurrency = max(settings.MIN_CONCURRENCY, min(self.global_max_workers, limit))
        logger.info(f"WorkerPool concurrency updated to {self.concurrency}")

    def set_performance_mode(self, mode: str):
        self.download_mode = mode.lower()
        if self.download_mode == "stable":
            self.concurrency = 4
            self.image_workers = 4
        elif self.download_mode == "balanced":
            self.concurrency = 10
            self.image_workers = 10
        elif self.download_mode == "fast":
            self.concurrency = 16
            self.image_workers = 16
        elif self.download_mode == "maximum":
            self.concurrency = 20
            self.image_workers = 20
        logger.info(f"WorkerPool mode set to {self.download_mode} with concurrency {self.concurrency}")

    async def start(self):
        """Start the worker pool and background loops."""
        if self._running:
            return
        self._running = True
        await self.recover_interrupted_jobs()
        self.dispatcher_task = asyncio.create_task(self._dispatcher_loop())
        self.metrics_task = asyncio.create_task(self._metrics_loop())
        logger.info(f"SaveXa V2 WorkerPool started with concurrency limit {self.concurrency} (Global Max: {self.global_max_workers})")

    async def stop(self):
        self._running = False
        if self.dispatcher_task:
            self.dispatcher_task.cancel()
        if self.metrics_task:
            self.metrics_task.cancel()
        for job_id, event in self.cancel_events.items():
            event.set()
        for job_id, task in self.active_tasks.items():
            task.cancel()

    async def recover_interrupted_jobs(self):
        """Inspect and reconcile jobs that were interrupted when the app was closed."""
        async with AsyncSessionLocal() as session:
            stmt = select(DownloadJob).where(
                DownloadJob.status.in_(["DOWNLOADING", "PROCESSING", "VERIFYING", "CONNECTING"])
            )
            result = await session.execute(stmt)
            jobs = result.scalars().all()
            for job in jobs:
                # Reset to QUEUED so they can be resumed cleanly
                job.status = "QUEUED"
                job.error_message = "Recovered after application restart"
            await session.commit()
            if jobs:
                logger.info(f"Recovered {len(jobs)} interrupted jobs into QUEUED state")

    async def _metrics_loop(self):
        """Calculates rolling 60s throughput, active workers, and broadcasts real-time speed metrics."""
        while self._running:
            try:
                await asyncio.sleep(1.0)
                now = time.time()
                total_speed = sum(self._active_speeds.values())

                # Speed in both MB/s and Mbps
                speed_mbps = (total_speed * 8) / 1_000_000
                speed_mbs = total_speed / (1024 * 1024)

                active_videos = sum(1 for t in self._job_media_types.values() if t == "video")
                active_images = sum(1 for t in self._job_media_types.values() if t == "image")

                point = {
                    "timestamp": now,
                    "speed_bytes_sec": total_speed,
                    "speed_mbps": round(speed_mbps, 2),
                    "speed_mbs": round(speed_mbs, 2),
                    "active_workers": len(self.active_tasks),
                    "active_images": active_images,
                    "active_videos": active_videos,
                }
                self._speed_history.append(point)
                # Keep last 60 seconds
                self._speed_history = self._speed_history[-60:]

                # Broadcast system performance event
                await ws_manager.broadcast({
                    "event": "SYSTEM_SPEED",
                    "speed_bytes_sec": total_speed,
                    "speed_mbps": round(speed_mbps, 2),
                    "speed_mbs": round(speed_mbs, 2),
                    "active_workers": len(self.active_tasks),
                    "active_images": active_images,
                    "active_videos": active_videos,
                    "concurrency": self.concurrency,
                })
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in metrics loop: {e}", exc_info=True)

    async def _handle_progress(self, job_id: str, p_data: dict[str, Any]):
        """Persist throttled progress to database and broadcast to WebSockets."""
        now = asyncio.get_event_loop().time()
        status = p_data.get("status", "DOWNLOADING")
        is_terminal = status in ("COMPLETED", "FAILED", "PROCESSING", "VERIFYING", "STALLED", "CONNECTING")

        last_time = self._last_progress_timestamps.get(job_id, 0.0)
        # Throttle to max 4 updates/sec unless transitioning states
        if not is_terminal and (now - last_time < 0.25):
            return
        self._last_progress_timestamps[job_id] = now
        self._last_activity_timestamps[job_id] = time.time()

        downloaded = p_data.get("downloaded_bytes", 0)
        total = p_data.get("total_bytes", 0)
        pct = p_data.get("progress", 0.0)
        speed = p_data.get("speed", 0.0)
        eta = p_data.get("eta")

        self._active_speeds[job_id] = speed

        # Update DB (guard against overwriting already finalized jobs)
        async with AsyncSessionLocal() as session:
            job = await session.get(DownloadJob, job_id)
            if not job or job.status in ("COMPLETED", "FAILED", "CANCELLED", "VERIFYING"):
                return
            if status == "CONNECTING" and job.status not in ("QUEUED", "READY"):
                return

            values_to_update: dict[str, Any] = {
                "status": status,
                "downloaded_bytes": downloaded,
                "progress": pct,
                "speed": speed,
                "eta": eta,
                "last_byte_received_at": utcnow() if speed > 0 else job.last_byte_received_at,
            }
            if total > 0:
                values_to_update["file_size"] = total

            # Additional image metadata if provided
            if p_data.get("image_width"):
                values_to_update["image_width"] = p_data["image_width"]
            if p_data.get("image_height"):
                values_to_update["image_height"] = p_data["image_height"]
            if p_data.get("actual_format"):
                values_to_update["actual_format"] = p_data["actual_format"]
            if p_data.get("content_hash"):
                values_to_update["content_hash"] = p_data["content_hash"]

            await session.execute(
                update(DownloadJob)
                .where(
                    DownloadJob.id == job_id,
                    DownloadJob.status.notin_(["COMPLETED", "FAILED", "CANCELLED", "VERIFYING"])
                )
                .values(**values_to_update)
            )
            await session.commit()

        # Broadcast WebSocket event
        await ws_manager.broadcast({
            "event": "JOB_PROGRESS",
            "job_id": job_id,
            "status": status,
            "downloaded_bytes": downloaded,
            "total_bytes": total,
            "progress": pct,
            "speed": speed,
            "speed_mbps": round((speed * 8) / 1_000_000, 2),
            "eta": eta,
        })

    async def _dispatcher_loop(self):
        """Continuously inspects the persistent queue and dispatches jobs under global & per-host quotas."""
        while self._running:
            try:
                available_slots = self.concurrency - len(self.active_tasks)
                if available_slots > 0:
                    async with AsyncSessionLocal() as session:
                        stmt = (
                            select(DownloadJob)
                            .where(DownloadJob.status == "QUEUED")
                            .order_by(DownloadJob.queue_position.asc(), DownloadJob.created_at.asc())
                            .limit(available_slots * 2) # Fetch candidate pool
                        )
                        result = await session.execute(stmt)
                        pending_jobs = result.scalars().all()

                        for job in pending_jobs:
                            if len(self.active_tasks) >= self.concurrency:
                                break
                            if job.id in self.active_tasks:
                                continue

                            m_type = job.media_type or "video"
                            # Per-media limits within global budget
                            active_video_count = sum(1 for t in self._job_media_types.values() if t == "video")
                            active_image_count = sum(1 for t in self._job_media_types.values() if t == "image")

                            if m_type == "video" and active_video_count >= self.video_workers:
                                continue
                            if m_type == "image" and active_image_count >= self.image_workers:
                                continue

                            # Per-host quota checking
                            try:
                                host = urllib.parse.urlparse(job.source_url).netloc.lower()
                            except Exception:
                                host = "default"
                            active_host_count = sum(1 for h in self._job_hosts.values() if h == host)
                            if active_host_count >= self.per_host_limit:
                                continue

                            # Claim job
                            job.status = "DOWNLOADING"
                            job.started_at = utcnow()
                            await session.commit()

                            # Track job metadata in worker pool
                            self._job_media_types[job.id] = m_type
                            self._job_hosts[job.id] = host

                            # Spawn worker task
                            cancel_ev = asyncio.Event()
                            self.cancel_events[job.id] = cancel_ev
                            task = asyncio.create_task(self._run_job(job.id, cancel_ev))
                            self.active_tasks[job.id] = task

                            # Notify clients of state change
                            await ws_manager.broadcast({
                                "event": "JOB_STATUS",
                                "job_id": job.id,
                                "status": "DOWNLOADING",
                                "batch_id": job.batch_id,
                                "media_type": m_type,
                            })

                # Check for stalled active jobs (> 30s without progress during DOWNLOADING)
                now_wall = time.time()
                for j_id in list(self.active_tasks.keys()):
                    last_act = self._last_activity_timestamps.get(j_id, now_wall)
                    if (now_wall - last_act) > 30.0:
                        async with AsyncSessionLocal() as session:
                            j = await session.get(DownloadJob, j_id)
                            if j and j.status == "DOWNLOADING":
                                j.status = "STALLED"
                                j.speed = 0.0
                                await session.commit()
                                await ws_manager.broadcast({
                                    "event": "JOB_PROGRESS",
                                    "job_id": j_id,
                                    "status": "STALLED",
                                    "downloaded_bytes": j.downloaded_bytes,
                                    "total_bytes": j.file_size,
                                    "progress": j.progress,
                                    "speed": 0.0,
                                    "eta": None,
                                })

                await asyncio.sleep(0.3)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in dispatcher loop: {e}", exc_info=True)
                await asyncio.sleep(0.5)

    async def _run_job(self, job_id: str, cancel_event: asyncio.Event):
        """Execute a single download job (video, audio, or high-speed image)."""
        loop = asyncio.get_running_loop()
        self._last_activity_timestamps[job_id] = time.time()

        def on_progress(p_data: dict[str, Any]):
            try:
                try:
                    running_loop = asyncio.get_running_loop()
                except RuntimeError:
                    running_loop = None

                if running_loop == loop:
                    asyncio.create_task(self._handle_progress(job_id, p_data))
                else:
                    asyncio.run_coroutine_threadsafe(self._handle_progress(job_id, p_data), loop)
            except Exception as e:
                logger.warning(f"Error dispatching progress for {job_id}: {e}")

        try:
            # Fetch job details
            async with AsyncSessionLocal() as session:
                job = await session.get(DownloadJob, job_id)
                if not job:
                    return
                url = job.source_url
                dest_dir = job.destination_dir
                quality = job.selected_quality
                fmt = job.selected_format
                bitrate = job.audio_bitrate
                m_type = job.media_type or "video"
                custom_filename = job.filename

            final_file_path: Optional[str] = None
            info: dict[str, Any] = {}

            # Route to appropriate downloader
            if m_type == "image":
                final_file_path = await self.image_downloader.download_image(
                    job_id=job_id,
                    url=url,
                    destination_dir=dest_dir,
                    filename=custom_filename,
                    output_format=fmt,
                    progress_callback=on_progress,
                    cancel_event=cancel_event,
                )
            elif self.direct_downloader.can_handle(url):
                final_file_path = await self.direct_downloader.download(
                    job_id=job_id,
                    url=url,
                    destination_dir=dest_dir,
                    quality=quality,
                    format_type=fmt,
                    audio_bitrate=bitrate,
                    progress_callback=on_progress,
                    cancel_event=cancel_event,
                )
            else:
                final_file_path = await self.ytdlp_downloader.download(
                    job_id=job_id,
                    url=url,
                    destination_dir=dest_dir,
                    quality=quality,
                    format_type=fmt,
                    audio_bitrate=bitrate,
                    progress_callback=on_progress,
                    cancel_event=cancel_event,
                )

            # Verification step
            async with AsyncSessionLocal() as session:
                await session.execute(
                    update(DownloadJob)
                    .where(DownloadJob.id == job_id)
                    .values(status="VERIFYING")
                )
                await session.commit()

            file_size = Path(final_file_path).stat().st_size
            actual_quality = quality
            actual_format = Path(final_file_path).suffix.lstrip(".") or fmt
            duration = None

            content_hash = None
            if m_type == "image":
                try:
                    import hashlib
                    with open(final_file_path, "rb") as f:
                        content_hash = hashlib.sha256(f.read()).hexdigest()
                except Exception:
                    pass
            else:
                info = await ffmpeg_service.inspect_file(final_file_path)
                file_size = info.get("file_size", file_size)
                actual_quality = info.get("resolution") or quality
                actual_format = Path(final_file_path).suffix.lstrip(".") or fmt
                duration = info.get("duration")

            # Mark completed in DB
            async with AsyncSessionLocal() as session:
                job = await session.get(DownloadJob, job_id)
                if job:
                    job.status = "COMPLETED"
                    job.progress = 100.0
                    job.output_path = final_file_path
                    job.filename = Path(final_file_path).name
                    job.file_size = file_size
                    job.downloaded_bytes = file_size
                    job.actual_quality = actual_quality
                    job.actual_format = actual_format
                    job.completed_at = utcnow()
                    if content_hash:
                        job.content_hash = content_hash

                    # Recover clean title from filename if title was placeholder
                    clean_stem = Path(final_file_path).stem
                    if job.title.startswith("watch_v=") or job.title.startswith("watch?v=") or job.title in ("Untitled Download", "Download") or job.title.startswith("Media_"):
                        recovered_title = re.sub(r'\s*\[[a-zA-Z0-9_-]{6,}\]$', '', clean_stem).strip()
                        job.title = recovered_title or clean_stem

                    # Record in History
                    history = DownloadHistory(
                        job_id=job.id,
                        media_identifier=job.media_id,
                        media_type=m_type,
                        title=job.title,
                        thumbnail_url=job.thumbnail_url,
                        output_path=final_file_path,
                        file_size=file_size,
                        format=actual_format,
                        quality=actual_quality,
                        duration=duration or job.duration,
                        source_url=job.source_url,
                        completed_at=utcnow()
                    )
                    session.add(history)

                    # Update batch counts if part of a batch
                    if job.batch_id:
                        batch = await session.get(Batch, job.batch_id)
                        if batch:
                            batch.completed_items = (batch.completed_items or 0) + 1
                            if (batch.completed_items + (batch.failed_items or 0) + (batch.skipped_items or 0)) >= batch.total_items:
                                batch.status = "completed"
                                batch.completed_at = utcnow()

                    await session.commit()

            await ws_manager.broadcast({
                "event": "JOB_COMPLETED",
                "job_id": job_id,
                "status": "COMPLETED",
                "output_path": final_file_path,
                "filename": Path(final_file_path).name,
                "file_size": file_size,
                "actual_quality": actual_quality,
                "media_type": m_type,
            })

        except asyncio.CancelledError:
            logger.info(f"Job {job_id} was cancelled")
            async with AsyncSessionLocal() as session:
                await session.execute(
                    update(DownloadJob)
                    .where(DownloadJob.id == job_id)
                    .values(status="CANCELLED", error_message="Cancelled by user")
                )
                await session.commit()
            await ws_manager.broadcast({
                "event": "JOB_STATUS",
                "job_id": job_id,
                "status": "CANCELLED"
            })
        except Exception as e:
            err_msg = str(e)
            logger.error(f"Job {job_id} failed: {err_msg}")
            async with AsyncSessionLocal() as session:
                job = await session.get(DownloadJob, job_id)
                if job:
                    if job.retry_count < job.max_retries and "cancelled" not in err_msg.lower() and "unavailable" not in err_msg.lower() and "private" not in err_msg.lower():
                        job.retry_count += 1
                        job.status = "QUEUED"
                        job.error_message = f"Retry {job.retry_count}/{job.max_retries}: {err_msg}"
                        await session.commit()
                        logger.info(f"Job {job_id} re-enqueued for retry ({job.retry_count}/{job.max_retries})")
                        await ws_manager.broadcast({
                            "event": "JOB_STATUS",
                            "job_id": job_id,
                            "status": "QUEUED",
                            "error_message": job.error_message
                        })
                    else:
                        job.status = "FAILED"
                        job.error_message = err_msg
                        if job.batch_id:
                            batch = await session.get(Batch, job.batch_id)
                            if batch:
                                batch.failed_items = (batch.failed_items or 0) + 1
                                if (batch.completed_items + batch.failed_items + (batch.skipped_items or 0)) >= batch.total_items:
                                    batch.status = "completed" if batch.completed_items > 0 else "failed"
                                    batch.completed_at = utcnow()
                        await session.commit()
                        await ws_manager.broadcast({
                            "event": "JOB_FAILED",
                            "job_id": job_id,
                            "status": "FAILED",
                            "error_message": err_msg
                        })
        finally:
            self.active_tasks.pop(job_id, None)
            self.cancel_events.pop(job_id, None)
            self._last_progress_timestamps.pop(job_id, None)
            self._last_activity_timestamps.pop(job_id, None)
            self._job_media_types.pop(job_id, None)
            self._job_hosts.pop(job_id, None)
            self._active_speeds.pop(job_id, None)

    async def cancel_job(self, job_id: str):
        if job_id in self.cancel_events:
            self.cancel_events[job_id].set()
        if job_id in self.active_tasks:
            self.active_tasks[job_id].cancel()
        async with AsyncSessionLocal() as session:
            await session.execute(
                update(DownloadJob)
                .where(DownloadJob.id == job_id)
                .values(status="CANCELLED")
            )
            await session.commit()

    async def pause_job(self, job_id: str):
        await self.cancel_job(job_id)
        async with AsyncSessionLocal() as session:
            await session.execute(
                update(DownloadJob)
                .where(DownloadJob.id == job_id)
                .values(status="PAUSED")
            )
            await session.commit()
        await ws_manager.broadcast({
            "event": "JOB_STATUS",
            "job_id": job_id,
            "status": "PAUSED"
        })

    async def resume_job(self, job_id: str):
        async with AsyncSessionLocal() as session:
            await session.execute(
                update(DownloadJob)
                .where(DownloadJob.id == job_id)
                .values(status="QUEUED")
            )
            await session.commit()
        await ws_manager.broadcast({
            "event": "JOB_STATUS",
            "job_id": job_id,
            "status": "QUEUED"
        })

    async def retry_job(self, job_id: str):
        async with AsyncSessionLocal() as session:
            await session.execute(
                update(DownloadJob)
                .where(DownloadJob.id == job_id)
                .values(status="QUEUED", error_message=None, retry_count=0)
            )
            await session.commit()
        await ws_manager.broadcast({
            "event": "JOB_STATUS",
            "job_id": job_id,
            "status": "QUEUED"
        })

worker_pool = WorkerPool()
