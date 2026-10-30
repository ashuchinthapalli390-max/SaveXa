import asyncio
import http.server
import os
import re
import socketserver
import tempfile
import threading
import uuid
import pytest

from app.database.connection import init_db, AsyncSessionLocal
from app.downloaders.direct import DirectDownloader
from app.models.entities import DownloadJob, Batch, DownloadHistory
from app.queue.worker_pool import WorkerPool
from app.utils.security import sanitize_filename, validate_url

TEST_PORT = 18999
TEST_HOST = "127.0.0.1"

class MockMediaServer(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass # Silence console noise

    def do_HEAD(self):
        if self.path == "/failing.mp4":
            self.send_response(500)
            self.end_headers()
            return

        payload_size = 10240 # 10 KB
        self.send_response(200)
        self.send_header("Content-Type", "video/mp4")
        self.send_header("Content-Length", str(payload_size))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Disposition", 'attachment; filename="sample_video.mp4"')
        self.end_headers()

    def do_GET(self):
        if self.path == "/failing.mp4":
            self.send_response(500)
            self.end_headers()
            self.wfile.write(b"Server Error")
            return

        payload = b"SAVEXA_RAW_VIDEO_PAYLOAD_CHUNK_" * 320 # ~10 KB
        total_len = len(payload)

        # Check Range header
        range_hdr = self.headers.get("Range")
        if range_hdr and range_hdr.startswith("bytes="):
            match = re.search(r"bytes=(\d+)-", range_hdr)
            start = int(match.group(1)) if match else 0
            if start < total_len:
                chunk = payload[start:]
                self.send_response(206)
                self.send_header("Content-Type", "video/mp4")
                self.send_header("Content-Range", f"bytes {start}-{total_len-1}/{total_len}")
                self.send_header("Content-Length", str(len(chunk)))
                self.send_header("Accept-Ranges", "bytes")
                self.end_headers()
                self.wfile.write(chunk)
                return

        self.send_response(200)
        self.send_header("Content-Type", "video/mp4")
        self.send_header("Content-Length", str(total_len))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Disposition", 'attachment; filename="sample_video.mp4"')
        self.end_headers()
        self.wfile.write(payload)

class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

@pytest.fixture(scope="session", autouse=True)
def run_mock_server():
    server = ThreadedHTTPServer((TEST_HOST, TEST_PORT), MockMediaServer)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    yield
    server.shutdown()
    server.server_close()

@pytest.fixture(scope="session", autouse=True)
def init_database():
    asyncio.run(init_db())

# =========================================================================
# TEST 1: Single Direct Download Test
# =========================================================================
@pytest.mark.asyncio
async def test_single_direct_download():
    """Verify single download analysis, streaming, progress, and file completion."""
    downloader = DirectDownloader()
    url = f"http://{TEST_HOST}:{TEST_PORT}/sample_video.mp4"

    meta = await downloader.analyze(url)
    assert meta.is_valid is True
    assert meta.source == "direct"
    assert "sample_video" in meta.title

    with tempfile.TemporaryDirectory() as tmp_dir:
        events = []
        def progress_cb(data):
            events.append(data)

        output_file = await downloader.download(
            job_id="test-job-1",
            url=url,
            destination_dir=tmp_dir,
            quality="original",
            format_type="mp4",
            audio_bitrate="320k",
            progress_callback=progress_cb
        )

        assert os.path.exists(output_file)
        assert os.path.getsize(output_file) > 1000
        assert events[-1]["status"] == "COMPLETED"
        assert events[-1]["progress"] == 100.0

# =========================================================================
# TEST 2: CRITICAL ACCEPTANCE TEST: Ten-Link Concurrent Batch (Concurrency = 3)
# =========================================================================
@pytest.mark.asyncio
async def test_ten_link_batch_concurrency():
    """
    Primary Acceptance Criterion:
    Submit 10 links together, verify concurrency does not exceed 3,
    verify all 10 reach completion, and all 10 resulting files exist on disk!
    """
    pool = WorkerPool()
    pool.set_concurrency(3)
    assert pool.concurrency == 3

    with tempfile.TemporaryDirectory() as dest_dir:
        batch_id = str(uuid.uuid4())
        job_ids = []

        # Create 10 persistent jobs in DB
        async with AsyncSessionLocal() as session:
            batch = Batch(
                id=batch_id,
                name="Ten-Link Acceptance Test",
                total_items=10,
                selected_preset="original",
                destination_folder=dest_dir,
                concurrency=3,
                status="active"
            )
            session.add(batch)

            for i in range(10):
                j_id = f"ten_batch_job_{i}_{uuid.uuid4().hex[:6]}"
                job_ids.append(j_id)
                job = DownloadJob(
                    id=j_id,
                    batch_id=batch_id,
                    source_url=f"http://{TEST_HOST}:{TEST_PORT}/item_{i}.mp4",
                    title=f"Media Item {i}",
                    selected_quality="original",
                    selected_format="mp4",
                    destination_dir=dest_dir,
                    status="QUEUED",
                    queue_position=i
                )
                session.add(job)
            await session.commit()

        # Start pool dispatcher and monitor concurrency
        await pool.start()
        max_observed_concurrency = 0

        # Wait for all 10 jobs to reach COMPLETED
        for _ in range(60): # up to 30 seconds
            active_count = len(pool.active_tasks)
            if active_count > max_observed_concurrency:
                max_observed_concurrency = active_count

            # Check how many are done
            async with AsyncSessionLocal() as session:
                res = await session.execute(
                    DownloadJob.__table__.select().where(DownloadJob.batch_id == batch_id)
                )
                rows = res.fetchall()
                completed = sum(1 for r in rows if r.status == "COMPLETED")
                if completed == 10:
                    break
            await asyncio.sleep(0.4)

        await pool.stop()

        # Concurrency verification: must never exceed configured limit of 3!
        assert max_observed_concurrency <= 3, f"Concurrency exceeded! Max observed: {max_observed_concurrency}"
        assert max_observed_concurrency >= 1

        # Check all 10 resulting files exist on disk
        async with AsyncSessionLocal() as session:
            res = await session.execute(
                DownloadJob.__table__.select().where(DownloadJob.batch_id == batch_id)
            )
            rows = res.fetchall()
            assert len(rows) == 10
            for r in rows:
                assert r.status == "COMPLETED", f"Job {r.id} did not complete: status is {r.status}"
                assert r.output_path is not None
                assert os.path.exists(r.output_path)
                assert os.path.getsize(r.output_path) > 0

# =========================================================================
# TEST 3: Invalid Link Resilience Test
# =========================================================================
@pytest.mark.asyncio
async def test_invalid_link_resilience():
    """Submit valid links + 1 failing link: ensure invalid link is caught without failing others."""
    pool = WorkerPool()
    pool.set_concurrency(2)

    with tempfile.TemporaryDirectory() as dest_dir:
        batch_id = str(uuid.uuid4())
        async with AsyncSessionLocal() as session:
            batch = Batch(
                id=batch_id,
                name="Resilience Test",
                total_items=3,
                destination_folder=dest_dir,
                concurrency=2,
                status="active"
            )
            session.add(batch)

            session.add(DownloadJob(
                id=f"resilience_valid_1_{uuid.uuid4().hex[:6]}",
                batch_id=batch_id,
                source_url=f"http://{TEST_HOST}:{TEST_PORT}/item_a.mp4",
                title="Valid Item A",
                selected_quality="original",
                selected_format="mp4",
                destination_dir=dest_dir,
                status="QUEUED"
            ))
            session.add(DownloadJob(
                id=f"resilience_failing_{uuid.uuid4().hex[:6]}",
                batch_id=batch_id,
                source_url=f"http://{TEST_HOST}:{TEST_PORT}/failing.mp4",
                title="Failing Item",
                selected_quality="original",
                selected_format="mp4",
                destination_dir=dest_dir,
                status="QUEUED",
                max_retries=1
            ))
            session.add(DownloadJob(
                id=f"resilience_valid_2_{uuid.uuid4().hex[:6]}",
                batch_id=batch_id,
                source_url=f"http://{TEST_HOST}:{TEST_PORT}/item_b.mp4",
                title="Valid Item B",
                selected_quality="original",
                selected_format="mp4",
                destination_dir=dest_dir,
                status="QUEUED"
            ))
            await session.commit()

        await pool.start()
        for _ in range(40):
            async with AsyncSessionLocal() as session:
                res = await session.execute(
                    DownloadJob.__table__.select().where(DownloadJob.batch_id == batch_id)
                )
                rows = res.fetchall()
                terminal = sum(1 for r in rows if r.status in ("COMPLETED", "FAILED"))
                if terminal == 3:
                    break
            await asyncio.sleep(0.4)

        await pool.stop()

        async with AsyncSessionLocal() as session:
            res = await session.execute(
                DownloadJob.__table__.select().where(DownloadJob.batch_id == batch_id)
            )
            rows = res.fetchall()
            completed = [r for r in rows if r.status == "COMPLETED"]
            failed = [r for r in rows if r.status == "FAILED"]
            assert len(completed) == 2, "Valid items must complete"
            assert len(failed) == 1, "Failing item must be accurately marked FAILED"

# =========================================================================
# TEST 4: Security and SSRF Prevention
# =========================================================================
def test_security_validation():
    """Verify SSRF, loopback, internal IP, and unsafe Windows filename defense."""
    ok, err = validate_url("file:///etc/passwd")
    assert not ok
    assert "Unsupported scheme" in err

    ok, err = validate_url("ftp://example.com/file.zip")
    assert not ok

    ok, err = validate_url("http://127.0.0.1:8000/secret")
    assert not ok
    assert "prohibited" in err

    ok, err = validate_url("http://169.254.169.254/latest/meta-data/")
    assert not ok
    assert "prohibited" in err

    ok, err = validate_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    assert ok

    # Filename sanitization
    assert sanitize_filename('test:video*name?"<>.mp4') == "test_video_name____.mp4"
    assert sanitize_filename("CON.mp4") == "_CON.mp4"
    assert sanitize_filename("PRN.txt") == "_PRN.txt"
    assert sanitize_filename("   .   ") == "SaveXa_download"

# =========================================================================
# TEST 5: Bulk 200 URL Limit Verification
# =========================================================================
@pytest.mark.asyncio
async def test_bulk_200_limit():
    """Verify that bulk URL analysis caps incoming batches at 200 items."""
    from app.api.analyze import analyze_bulk_urls
    from app.schemas.media import BulkAnalysisRequest

    # Submit 220 URLs
    test_urls = [f"http://{TEST_HOST}:{TEST_PORT}/sample_video.mp4?idx={i}" for i in range(220)]
    req = BulkAnalysisRequest(urls=test_urls, allow_localhost=True)
    results = await analyze_bulk_urls(req)

    # Must be bounded at exactly 200 items
    assert len(results) == 200
    for r in results:
        assert r.is_valid is True
