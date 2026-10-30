import os
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Route all tests to an isolated test database
test_db_path = backend_dir.parent / "data" / "savexa_test.db"
os.environ["SAVEXA_DATABASE_URL"] = f"sqlite+aiosqlite:///{test_db_path}"

import pytest

@pytest.fixture(scope="session", autouse=True)
def clean_test_database():
    # Remove any stale test db before run
    for ext in ["", "-wal", "-shm"]:
        p = Path(f"{test_db_path}{ext}")
        if p.exists():
            try:
                p.unlink()
            except Exception:
                pass

    yield

    # Cleanup after test suite finishes
    for ext in ["", "-wal", "-shm"]:
        p = Path(f"{test_db_path}{ext}")
        if p.exists():
            try:
                p.unlink()
            except Exception:
                pass
