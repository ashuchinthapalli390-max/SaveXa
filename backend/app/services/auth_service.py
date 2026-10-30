import json
import logging
import os
import psutil
from pathlib import Path
from typing import Optional, Dict, Any, Tuple

from app.core.config import settings
from app.schemas.media import AuthStatusResponse, ConnectBrowserRequest

logger = logging.getLogger("savexa.auth")

DISCLAIMER_TEXT = (
    "Authentication uses local browser session data strictly on this machine. "
    "Credentials and cookies are never transmitted to external servers, logged, or exported. "
    "Authentication cannot bypass DRM, copyright restrictions, or private memberships without authorized access."
)


class AuthService:
    """Manages optional local source authentication using supported yt-dlp browser-session options."""

    def __init__(self):
        self.config_path = settings.DATA_DIR / "auth_config.json"
        self._load_config()

    def _load_config(self):
        self.auth_mode: str = "none"
        self.selected_browser: Optional[str] = None
        self.user_approved: bool = False
        self.disclaimer_acknowledged: bool = False
        self.last_updated: Optional[str] = None

        if self.config_path.is_file():
            try:
                with open(self.config_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.auth_mode = data.get("auth_mode", "none")
                    self.selected_browser = data.get("selected_browser")
                    self.user_approved = bool(data.get("user_approved", False))
                    self.disclaimer_acknowledged = bool(data.get("disclaimer_acknowledged", False))
                    self.last_updated = data.get("last_updated")
            except Exception as e:
                logger.warning(f"Could not load auth config: {e}")

    def _save_config(self):
        try:
            settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
            data = {
                "auth_mode": self.auth_mode,
                "selected_browser": self.selected_browser,
                "user_approved": self.user_approved,
                "disclaimer_acknowledged": self.disclaimer_acknowledged,
            }
            with open(self.config_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save auth config: {e}")

    def is_browser_locked(self, browser: str = "chrome") -> Tuple[bool, Optional[str]]:
        """Detect whether the browser process is actively running and locking its cookie store on Windows."""
        if os.name != "nt":
            return False, None

        browser_proc_names = {
            "chrome": "chrome.exe",
            "edge": "msedge.exe",
            "brave": "brave.exe",
            "firefox": "firefox.exe",
        }
        proc_name = browser_proc_names.get(browser.lower(), f"{browser.lower()}.exe")

        # Check running processes
        is_running = False
        try:
            for p in psutil.process_iter(["name"]):
                if p.info["name"] and p.info["name"].lower() == proc_name.lower():
                    is_running = True
                    break
        except Exception:
            pass

        if not is_running:
            return False, None

        # Process is running; test if cookie file is locked
        local_app = os.environ.get("LOCALAPPDATA", "")
        cookie_path = None
        if browser.lower() == "chrome":
            cookie_path = Path(local_app) / "Google" / "Chrome" / "User Data" / "Default" / "Network" / "Cookies"
        elif browser.lower() == "edge":
            cookie_path = Path(local_app) / "Microsoft" / "Edge" / "User Data" / "Default" / "Network" / "Cookies"

        if cookie_path and cookie_path.is_file():
            try:
                with open(cookie_path, "rb") as f:
                    f.read(1)
                return False, None
            except (PermissionError, OSError):
                return True, (
                    f"Google {browser.capitalize()} is currently running with an exclusive database lock. "
                    "Close the browser briefly before starting bulk extraction, or export cookies to data/cookies.txt."
                )

        return is_running, f"{browser.capitalize()} is running in the background."

    def get_status(self) -> AuthStatusResponse:
        """Returns safe, redacted status of local authentication."""
        is_conn = self.user_approved and self.auth_mode == "browser" and bool(self.selected_browser)
        browser = self.selected_browser or "chrome"
        locked, reason = self.is_browser_locked(browser) if is_conn else (False, None)

        msg = "Running in anonymous mode. No browser cookies or account credentials active."
        if is_conn:
            if locked:
                msg = f"Connected to {browser.capitalize()} session (Database locked by running browser)."
            else:
                msg = f"Connected to {browser.capitalize()} session. Local browser cookies enabled for yt-dlp."
        elif self.auth_mode == "cookies_file":
            msg = "Using custom data/cookies.txt file."

        return AuthStatusResponse(
            auth_mode=self.auth_mode,
            selected_browser=self.selected_browser,
            user_approved=self.user_approved,
            is_connected=is_conn,
            browser_lock_detected=locked,
            lock_reason=reason,
            diagnostic_message=msg,
            disclaimer=DISCLAIMER_TEXT,
        )

    def connect_browser(self, req: ConnectBrowserRequest) -> AuthStatusResponse:
        """Connects local browser session after explicit user approval."""
        if not req.user_approved:
            raise ValueError("Explicit user approval is required to enable browser session authentication.")

        browser = (req.browser or "chrome").lower()
        if browser not in ("chrome", "edge", "firefox", "brave"):
            raise ValueError(f"Browser '{browser}' is not supported for yt-dlp browser authentication.")

        self.auth_mode = "browser"
        self.selected_browser = browser
        self.user_approved = True
        self.disclaimer_acknowledged = req.acknowledge_disclaimer
        self._save_config()

        logger.info(f"Local browser authentication connected for '{browser}' with explicit user approval.")
        return self.get_status()

    def disconnect(self) -> AuthStatusResponse:
        """Disconnects browser session authentication and reverts to anonymous mode."""
        self.auth_mode = "none"
        self.selected_browser = None
        self.user_approved = False
        self.disclaimer_acknowledged = False
        self._save_config()

        logger.info("Local browser authentication disconnected. Reverted to anonymous mode.")
        return self.get_status()

    def get_ytdlp_auth_opts(self) -> Dict[str, Any]:
        """Provides yt-dlp options based on approved local authentication state."""
        opts: Dict[str, Any] = {}

        # 1. Custom cookies.txt always takes precedence if explicitly placed
        cookie_file = settings.DATA_DIR / "cookies.txt"
        if cookie_file.is_file() and cookie_file.stat().st_size > 0:
            opts["cookiefile"] = str(cookie_file)
            return opts

        # 2. Approved browser session
        if self.user_approved and self.auth_mode == "browser" and self.selected_browser:
            opts["cookiesfrombrowser"] = (self.selected_browser,)

        return opts


auth_service = AuthService()
