# Must run before any `app.*` import anywhere in the test session: app.core.config.Settings
# is a module-level singleton instantiated on first import, and it selects DATABASE_URL vs
# TEST_DATABASE_URL based on this flag. Setting it here — the first thing conftest.py does —
# guarantees no test module can import the app before the test database is selected.
import os
os.environ["TESTING"] = "true"

from pathlib import Path
from unittest.mock import patch

import pytest
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.schema import DropTable


@compiles(DropTable, "postgresql")
def _drop_table_cascade(element, compiler, **kwargs):
    # Postgres ENUM types (e.g. jobstatus) are dropped as a separate DDL step
    # after their owning table. Without CASCADE here, drop_all() can fail with
    # "cannot drop type X because other objects depend on it" if that type's
    # column hasn't been removed yet when the type-drop statement runs.
    return compiler.visit_drop_table(element) + " CASCADE"


@pytest.fixture(scope="session", autouse=True)
def _migrate_test_database_to_head():
    # The single source of schema truth for the test database is Alembic, not
    # Base.metadata.create_all — this runs once per test session, before any test
    # touches the database. Individual tests still use create_all/drop_all for fast
    # per-test table resets, but the *starting* schema always comes from migrations,
    # so drift like the config.job_logs.status column gap can't hide in tests again.
    from app.core.config import settings
    assert settings.TESTING is True, "conftest failed to set TESTING=true before Settings() was built"
    assert settings.TEST_DATABASE_URL and settings.DATABASE_URL == settings.TEST_DATABASE_URL, (
        "Refusing to run tests: DATABASE_URL does not resolve to TEST_DATABASE_URL"
    )

    from alembic import command
    from alembic.config import Config

    backend_dir = Path(__file__).resolve().parent.parent
    cfg = Config(str(backend_dir / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    command.upgrade(cfg, "head")
    yield

# Global dict to act as mock Redis database
_mock_redis_db = {}

class MockRedis:
    def ping(self):
        return True
    def get(self, key):
        return _mock_redis_db.get(str(key))
    def set(self, key, value, ex=None, px=None, nx=False, xx=False):
        _mock_redis_db[str(key)] = str(value)
        return True
    def setex(self, key, time, value):
        _mock_redis_db[str(key)] = str(value)
        return True
    def delete(self, *names):
        count = 0
        for n in names:
            if str(n) in _mock_redis_db:
                del _mock_redis_db[str(n)]
                count += 1
        return count
    def exists(self, *names):
        return sum(1 for n in names if str(n) in _mock_redis_db)

@pytest.fixture(autouse=True)
def configure_test_infrastructure(request):
    # Identify integration tests that strictly require real Redis/Celery connections.
    # We treat 'test_redis.py', 'test_full_pipeline_e2e.py' and 'test_snapshot_load.py'
    # and any test node marked with 'integration' or 'e2e' as integration tests.
    node_id = request.node.nodeid.lower()
    is_integration = (
        "test_redis" in node_id or
        "test_full_pipeline_e2e" in node_id or
        "test_snapshot_load" in node_id or
        "integration" in request.node.keywords or
        "e2e" in request.node.keywords
    )

    if is_integration:
        yield
        return

    # Enable Celery eager mode for synchronous execution in unit tests
    try:
        from app.workers.celery_app import celery_app
        celery_app.conf.task_always_eager = True
        celery_app.conf.task_eager_propagates = True
    except Exception:
        pass

    # Create mock Redis client and patch core redis methods
    mock_client = MockRedis()

    with patch("app.core.redis.get_redis_client", return_value=mock_client), \
         patch("app.core.redis.check_redis_health", return_value=True), \
         patch("celery.Celery.send_task"):
        yield
