import asyncio
import io
import os
import tempfile
import uuid
import pytest
from PIL import Image

from app.database.connection import init_db, AsyncSessionLocal
from app.downloaders.image_downloader import ImageDownloader, image_downloader
from app.services.zip_service import zip_service
from app.queue.worker_pool import WorkerPool
from app.models.entities import DownloadJob, Batch

@pytest.fixture(scope="session", autouse=True)
def ensure_db():
    asyncio.run(init_db())

# =========================================================================
# TEST 1: Original URL Resolution
# =========================================================================
def test_original_url_resolution():
    dl = ImageDownloader()

    # Wikimedia thumbnail to original
    wiki_thumb = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Example.jpg/800px-Example.jpg"
    assert dl.resolve_original_url(wiki_thumb) == "https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg"

    # Twitter thumbnail to original
    twitter_thumb = "https://pbs.twimg.com/media/Example?format=jpg&name=small"
    assert dl.resolve_original_url(twitter_thumb) == "https://pbs.twimg.com/media/Example?format=jpg&name=orig"

    # Unsplash downscaled to raw original
    unsplash_thumb = "https://images.unsplash.com/photo-1234?w=500&q=80"
    resolved_unsplash = dl.resolve_original_url(unsplash_thumb)
    assert resolved_unsplash == "https://images.unsplash.com/photo-1234"
    assert "w=" not in resolved_unsplash

# =========================================================================
# TEST 2: Pillow Verification & Format Conversion
# =========================================================================
def test_image_verification_and_conversion():
    dl = ImageDownloader()

    with tempfile.TemporaryDirectory() as temp_dir:
        # Create a sample test PNG image
        test_img_path = os.path.join(temp_dir, "sample.png")
        img = Image.new("RGBA", (300, 200), color=(37, 99, 235, 255))
        img.save(test_img_path, "PNG")

        # Verify raster integrity
        is_valid, w, h, fmt = dl.verify_image(test_img_path)
        assert is_valid is True
        assert w == 300
        assert h == 200
        assert fmt.lower() == "png"

        # Convert to JPEG
        jpg_path = dl.convert_image(test_img_path, "jpg")
        assert os.path.exists(jpg_path)
        assert jpg_path.endswith(".jpg")
        is_valid_jpg, jw, jh, jfmt = dl.verify_image(jpg_path)
        assert is_valid_jpg is True
        assert jw == 300
        assert jh == 200
        assert jfmt.lower() in ("jpeg", "jpg")

# =========================================================================
# TEST 3: ZIP Service Packaging
# =========================================================================
@pytest.mark.asyncio
async def test_zip_service_packaging():
    with tempfile.TemporaryDirectory() as temp_dir:
        file1 = os.path.join(temp_dir, "test1.txt")
        file2 = os.path.join(temp_dir, "test2.png")
        with open(file1, "w") as f:
            f.write("SaveXa test payload 1")

        img = Image.new("RGB", (100, 100), color=(10, 20, 30))
        img.save(file2, "PNG")

        zip_out = os.path.join(temp_dir, "export.zip")
        created_zip = await zip_service.create_zip_async([file1, file2], zip_out)

        assert os.path.exists(created_zip)
        assert os.path.getsize(created_zip) > 0

        # Verify zip contents
        import zipfile
        with zipfile.ZipFile(created_zip, "r") as z:
            names = z.namelist()
            assert "test1.txt" in names
            assert "test2.png" in names

# =========================================================================
# TEST 4: High-Speed 20-Worker Concurrency Architecture
# =========================================================================
def test_worker_pool_concurrency_modes():
    pool = WorkerPool()
    assert pool.global_max_workers == 20

    # Test performance modes
    pool.set_performance_mode("stable")
    assert pool.concurrency == 4

    pool.set_performance_mode("balanced")
    assert pool.concurrency == 10

    pool.set_performance_mode("fast")
    assert pool.concurrency == 16

    pool.set_performance_mode("maximum")
    assert pool.concurrency == 20

    # Custom bounded concurrency
    pool.set_concurrency(25) # Should cap at 20
    assert pool.concurrency == 20

    pool.set_concurrency(0) # Should floor at 1
    assert pool.concurrency == 1

# =========================================================================
# TEST 5: Image Batch Creation in Database
# =========================================================================
@pytest.mark.asyncio
async def test_image_batch_creation():
    from app.api.images import create_image_batch
    from app.schemas.media import CreateImageBatchRequest, CreateImageItemRequest

    with tempfile.TemporaryDirectory() as temp_dir:
        req = CreateImageBatchRequest(
            name="Test Artwork Batch",
            destination_folder=temp_dir,
            concurrency=10,
            target_format="original",
            items=[
                CreateImageItemRequest(
                    url="https://example.com/art1.png",
                    filename="art1.png",
                    width=1920,
                    height=1080,
                    target_format="original"
                ),
                CreateImageItemRequest(
                    url="https://example.com/art2.jpg",
                    filename="art2.jpg",
                    width=2560,
                    height=1440,
                    target_format="original"
                ),
            ]
        )

        res = await create_image_batch(req)
        assert res.total_items == 2

        async with AsyncSessionLocal() as session:
            jobs_res = await session.execute(
                DownloadJob.__table__.select().where(DownloadJob.batch_id == res.id)
            )
            jobs = jobs_res.fetchall()
            assert len(jobs) == 2
            for j in jobs:
                assert j.media_type == "image"
                assert j.destination_dir == temp_dir
                assert j.status == "QUEUED"
