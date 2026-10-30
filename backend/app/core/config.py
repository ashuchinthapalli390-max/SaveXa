import os
import shutil
import sys
from pathlib import Path

def get_default_download_dir() -> str:
    """Get default user download directory on Windows / cross-platform."""
    user_profile = os.environ.get("USERPROFILE")
    if user_profile:
        download_path = Path(user_profile) / "Downloads" / "SaveXa"
    else:
        download_path = Path.home() / "Downloads" / "SaveXa"
    download_path.mkdir(parents=True, exist_ok=True)
    return str(download_path.resolve())

def get_default_images_dir() -> str:
    """Get default user images download directory."""
    user_profile = os.environ.get("USERPROFILE")
    if user_profile:
        img_path = Path(user_profile) / "Downloads" / "SaveXa" / "Images"
    else:
        img_path = Path.home() / "Downloads" / "SaveXa" / "Images"
    img_path.mkdir(parents=True, exist_ok=True)
    return str(img_path.resolve())

def detect_ffmpeg_path() -> str:
    """Detect ffmpeg binary location."""
    # 1. Environment variable override
    env_path = os.environ.get("SAVEXA_FFMPEG_PATH")
    if env_path and os.path.isfile(env_path):
        return env_path
    
    # 2. Check system PATH
    found = shutil.which("ffmpeg")
    if found:
        return found
        
    # 3. Check common winget installation paths on Windows
    user_profile = os.environ.get("USERPROFILE", "")
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    candidates = [
        Path(local_app_data) / "Microsoft" / "WinGet" / "Links" / "ffmpeg.exe",
        Path("C:/Program Files/ffmpeg/bin/ffmpeg.exe"),
        Path(user_profile) / "AppData" / "Local" / "Microsoft" / "WinGet" / "Packages",
    ]
    for c in candidates:
        if c.is_file():
            return str(c.resolve())
        elif c.is_dir():
            # search for ffmpeg.exe inside
            matches = list(c.glob("**/ffmpeg.exe"))
            if matches:
                return str(matches[0].resolve())

    # 4. Fallback to imageio-ffmpeg if available
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        pass

    return "ffmpeg"

def detect_ffprobe_path() -> str:
    """Detect ffprobe binary location."""
    env_path = os.environ.get("SAVEXA_FFPROBE_PATH")
    if env_path and os.path.isfile(env_path):
        return env_path
        
    found = shutil.which("ffprobe")
    if found:
        return found
        
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    user_profile = os.environ.get("USERPROFILE", "")
    candidates = [
        Path(local_app_data) / "Microsoft" / "WinGet" / "Links" / "ffprobe.exe",
        Path("C:/Program Files/ffmpeg/bin/ffprobe.exe"),
    ]
    for c in candidates:
        if c.is_file():
            return str(c.resolve())
            
    matches = list((Path(user_profile) / "AppData" / "Local" / "Microsoft" / "WinGet" / "Packages").glob("**/ffprobe.exe"))
    if matches:
        return str(matches[0].resolve())

    return "ffprobe"

class Settings:
    PROJECT_NAME: str = "SaveXa"
    VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"
    
    # Base paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent.parent
    DATA_DIR: Path = BASE_DIR / "data"
    LOGS_DIR: Path = BASE_DIR / "logs"
    TEMP_DIR: Path = DATA_DIR / "temp"
    
    DATABASE_URL: str = os.environ.get("SAVEXA_DATABASE_URL", f"sqlite+aiosqlite:///{DATA_DIR / 'savexa.db'}")
    DEFAULT_DESTINATION: str = get_default_download_dir()
    DEFAULT_IMAGES_DESTINATION: str = get_default_images_dir()
    
    # Media tools
    FFMPEG_PATH: str = detect_ffmpeg_path()
    FFPROBE_PATH: str = detect_ffprobe_path()
    
    # Global Worker & Concurrency budget (Up to 20 workers)
    DEFAULT_CONCURRENCY: int = 10
    GLOBAL_MAX_WORKERS: int = 20
    DEFAULT_IMAGE_WORKERS: int = 10
    FAST_IMAGE_WORKERS: int = 16
    MAX_IMAGE_WORKERS: int = 20
    DEFAULT_VIDEO_WORKERS: int = 3
    DEFAULT_PER_HOST_LIMIT: int = 4
    MAX_CONCURRENCY: int = 20
    MIN_CONCURRENCY: int = 1
    DEFAULT_MAX_RETRIES: int = 3
    
    # Server network
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]

settings = Settings()

# Ensure directories exist
settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
settings.LOGS_DIR.mkdir(parents=True, exist_ok=True)
settings.TEMP_DIR.mkdir(parents=True, exist_ok=True)
