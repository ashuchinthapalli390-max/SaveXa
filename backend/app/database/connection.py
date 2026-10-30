import asyncio
from typing import AsyncGenerator
from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import declarative_base
from app.core.config import settings

Base = declarative_base()

# SQLite engine with timeout and WAL pragma
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    connect_args={"timeout": 30},
)

@event.listens_for(engine.sync_engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA busy_timeout=10000")
    cursor.close()

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

async def init_db() -> None:
    """Create all tables if they don't exist and run non-destructive schema migrations."""
    async with engine.begin() as conn:
        # Import models so they are registered with Base
        from app.models.entities import Batch, DownloadJob, DownloadHistory, Setting, JobEvent
        await conn.run_sync(Base.metadata.create_all)

        def migrate_schema(sync_conn):
            from sqlalchemy import text
            # Inspect download_jobs
            res = sync_conn.execute(text("PRAGMA table_info(download_jobs)"))
            job_cols = {row[1] for row in res.fetchall()}

            job_additions = [
                ("media_type", "TEXT DEFAULT 'video'"),
                ("image_width", "INTEGER"),
                ("image_height", "INTEGER"),
                ("mime_type", "TEXT"),
                ("image_format", "TEXT"),
                ("source_variant", "TEXT"),
                ("original_resolution_verified", "INTEGER DEFAULT 1"),
                ("content_hash", "TEXT"),
                ("download_engine", "TEXT DEFAULT 'direct'"),
                ("last_byte_received_at", "TIMESTAMP"),
            ]
            for col_name, col_type in job_additions:
                if col_name not in job_cols:
                    sync_conn.execute(text(f"ALTER TABLE download_jobs ADD COLUMN {col_name} {col_type}"))

            # Inspect download_history
            res_h = sync_conn.execute(text("PRAGMA table_info(download_history)"))
            hist_cols = {row[1] for row in res_h.fetchall()}
            hist_additions = [
                ("media_type", "TEXT DEFAULT 'video'"),
                ("thumbnail_url", "TEXT"),
                ("dimensions", "TEXT"),
            ]
            for col_name, col_type in hist_additions:
                if col_name not in hist_cols:
                    sync_conn.execute(text(f"ALTER TABLE download_history ADD COLUMN {col_name} {col_type}"))

        await conn.run_sync(migrate_schema)
