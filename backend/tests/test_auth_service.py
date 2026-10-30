import pytest
from app.services.auth_service import AuthService, DISCLAIMER_TEXT
from app.schemas.media import ConnectBrowserRequest, AnalysisStatus
from app.downloaders.ytdlp import classify_ytdlp_error


def test_default_auth_state_anonymous(tmp_path):
    svc = AuthService()
    # Mock config_path to temporary file
    svc.config_path = tmp_path / "auth_config.json"
    svc.disconnect()

    status = svc.get_status()
    assert status.auth_mode == "none"
    assert status.selected_browser is None
    assert status.user_approved is False
    assert status.is_connected is False
    assert "anonymous" in status.diagnostic_message.lower()
    assert status.disclaimer == DISCLAIMER_TEXT


def test_connect_browser_requires_approval(tmp_path):
    svc = AuthService()
    svc.config_path = tmp_path / "auth_config.json"

    # Attempt without explicit user approval
    req = ConnectBrowserRequest(browser="chrome", user_approved=False)
    with pytest.raises(ValueError, match="Explicit user approval is required"):
        svc.connect_browser(req)


def test_connect_browser_chrome_success(tmp_path):
    svc = AuthService()
    svc.config_path = tmp_path / "auth_config.json"

    req = ConnectBrowserRequest(browser="chrome", user_approved=True, acknowledge_disclaimer=True)
    status = svc.connect_browser(req)

    assert status.auth_mode == "browser"
    assert status.selected_browser == "chrome"
    assert status.user_approved is True
    assert status.is_connected is True

    # Test yt-dlp auth options generation
    opts = svc.get_ytdlp_auth_opts()
    assert opts.get("cookiesfrombrowser") == ("chrome",)


def test_disconnect_reverts_to_anonymous(tmp_path):
    svc = AuthService()
    svc.config_path = tmp_path / "auth_config.json"

    # Connect first
    svc.connect_browser(ConnectBrowserRequest(browser="chrome", user_approved=True))
    assert svc.get_status().is_connected is True

    # Disconnect
    status = svc.disconnect()
    assert status.auth_mode == "none"
    assert status.selected_browser is None
    assert status.user_approved is False
    assert status.is_connected is False
    assert svc.get_ytdlp_auth_opts() == {}


def test_security_redaction_invariant(tmp_path):
    svc = AuthService()
    svc.config_path = tmp_path / "auth_config.json"
    svc.connect_browser(ConnectBrowserRequest(browser="chrome", user_approved=True))

    status = svc.get_status()
    status_dict = status.model_dump()

    # Invariant: No tokens, passwords, cookies, or secrets exist in the model
    forbidden_keys = ["cookies", "token", "password", "secret", "cookiejar", "raw_cookie"]
    for key in status_dict.keys():
        assert key not in forbidden_keys, f"Forbidden key found in AuthStatusResponse: {key}"

    # Also verify serialized JSON doesn't expose any cookie headers
    serialized = status.model_dump_json()
    assert "Cookie: " not in serialized
    assert "sessionid" not in serialized
    assert "SID=" not in serialized


def test_unsupported_browser_rejected(tmp_path):
    svc = AuthService()
    svc.config_path = tmp_path / "auth_config.json"

    req = ConnectBrowserRequest(browser="internet_explorer_99", user_approved=True)
    with pytest.raises(ValueError, match="not supported"):
        svc.connect_browser(req)


def test_classify_ytdlp_browser_lock_error():
    err = PermissionError(13, "Could not copy Chrome cookie database. See https://github.com/yt-dlp/yt-dlp/issues/7271")
    status, code, msg, action = classify_ytdlp_error("https://www.youtube.com/watch?v=sample", err)

    assert status == AnalysisStatus.SOURCE_ACCESS_CHALLENGE
    assert code == "BROWSER_COOKIE_LOCKED"
    assert "locked its cookie session" in msg or "lock" in msg
    assert "data/cookies.txt" in action or "close" in action.lower()


@pytest.mark.asyncio
async def test_auth_api_endpoints():
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # GET status
        r = await ac.get("/api/auth/status")
        assert r.status_code == 200
        data = r.json()
        assert "auth_mode" in data
        assert "disclaimer" in data

        # POST connect without approval -> 400
        r = await ac.post("/api/auth/connect", json={"browser": "chrome", "user_approved": False})
        assert r.status_code == 400

        # POST connect with approval -> 200
        r = await ac.post("/api/auth/connect", json={"browser": "chrome", "user_approved": True, "acknowledge_disclaimer": True})
        assert r.status_code == 200
        assert r.json()["is_connected"] is True
        assert r.json()["selected_browser"] == "chrome"

        # POST disconnect -> 200
        r = await ac.post("/api/auth/disconnect")
        assert r.status_code == 200
        assert r.json()["is_connected"] is False
        assert r.json()["auth_mode"] == "none"
