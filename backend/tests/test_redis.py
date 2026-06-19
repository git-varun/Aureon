from app.core.redis import check_redis_health, get_redis_client


def test_redis_connectivity() -> None:
    assert check_redis_health() is True
    
    client = get_redis_client()
    assert client.ping() is True
