import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.api import system, analyze, downloads, batches, history, settings as app_settings, media_library, images, performance, auth
from app.core.config import settings
from app.database.connection import init_db, AsyncSessionLocal
from app.models.entities import DownloadJob
from app.queue.worker_pool import worker_pool, ws_manager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    await worker_pool.start()
    yield
    # Shutdown
    await worker_pool.stop()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers under /api
app.include_router(system.router, prefix=settings.API_PREFIX)
app.include_router(analyze.router, prefix=settings.API_PREFIX)
app.include_router(downloads.router, prefix=settings.API_PREFIX)
app.include_router(batches.router, prefix=settings.API_PREFIX)
app.include_router(history.router, prefix=settings.API_PREFIX)
app.include_router(app_settings.router, prefix=settings.API_PREFIX)
app.include_router(media_library.router, prefix=settings.API_PREFIX)
app.include_router(images.router, prefix=settings.API_PREFIX)
app.include_router(performance.router, prefix=settings.API_PREFIX)
app.include_router(auth.router, prefix=settings.API_PREFIX)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        # Send initial snapshot of active/queued downloads
        async with AsyncSessionLocal() as session:
            stmt = select(DownloadJob).where(
                DownloadJob.status.in_(["DOWNLOADING", "QUEUED", "PROCESSING", "VERIFYING"])
            )
            res = await session.execute(stmt)
            active_jobs = res.scalars().all()
            await websocket.send_json({
                "event": "SNAPSHOT",
                "jobs": [
                    {
                        "id": j.id,
                        "title": j.title,
                        "status": j.status,
                        "progress": j.progress,
                        "speed": j.speed,
                        "eta": j.eta,
                        "downloaded_bytes": j.downloaded_bytes,
                        "file_size": j.file_size,
                        "selected_quality": j.selected_quality,
                        "selected_format": j.selected_format,
                        "batch_id": j.batch_id,
                    }
                    for j in active_jobs
                ]
            })

        while True:
            # Keep connection alive & listen for client pings or controls
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=False)

