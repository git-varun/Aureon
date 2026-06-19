from unittest.mock import patch

import pytest

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
