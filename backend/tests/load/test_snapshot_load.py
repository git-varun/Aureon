import asyncio
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Generator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine, insert
from sqlalchemy.orm import sessionmaker

from app.api.main import app
from app.core.config import settings
from app.core.database import get_db
from app.core.redis import get_redis_client
from app.domain.entities.base import Base
from app.domain.entities.market import AssetSnapshot

# Isolate test database configuration.
# A bounded pool that reuses connections — NullPool opens a brand-new physical connection per
# checkout, and 100 concurrent requests against it reliably exhausted Postgres max_connections.
_test_connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}
test_engine = create_engine(
    settings.DATABASE_URL, echo=False, connect_args=_test_connect_args,
    pool_size=60, max_overflow=20, pool_timeout=60,
)
if test_engine.dialect.name == 'sqlite':
    test_engine = test_engine.execution_options(schema_translate_map={'system': None, 'market': None, 'portfolio': None, 'evaluation': None, 'recommendation': None, 'watchlist': None, 'config': None, 'notification': None, 'news': None, 'ai': None})
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

def override_get_db() -> Generator[Any, None, None]:
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(scope="module")
def setup_data() -> Generator[list[uuid.UUID], None, None]:
    Base.metadata.create_all(bind=test_engine)
    session = TestSessionLocal()
    # Create 10,000 assets
    asset_ids = [uuid.uuid4() for _ in range(10000)]
    now = datetime.now(timezone.utc)
    
    # Bulk insert
    snapshots = []
    for aid in asset_ids:
        snapshots.append({
            "asset_id": aid,
            "price": 100.0,
            "market_cap": None,
            "pe_ratio": None,
            "rsi": None,
            "momentum_score": None,
            "volatility_score": None,
            "sentiment_score": None,
            "payload": {},
            "created_at": now,
            "updated_at": now
        })
    
    # Insert in chunks
    for i in range(0, 10000, 50):
        session.execute(insert(AssetSnapshot).values(snapshots[i:i+50]))
    session.commit()
    
    yield asset_ids
    
    # Teardown
    session.query(AssetSnapshot).delete()
    session.commit()
    session.close()

@pytest.mark.asyncio
async def test_snapshot_load_10000_assets(setup_data: list[uuid.UUID]) -> None:
    asset_ids = setup_data
    client = get_redis_client()
    client.flushdb()
    
    async def fetch(ac: AsyncClient, url: str) -> tuple[int, float]:
        t0 = time.time()
        r = await ac.get(url)
        return r.status_code, time.time() - t0
        
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # DB Hits (Cache empty)
        tasks = [fetch(ac, f"/api/v1/market/assets/{aid}/snapshot") for aid in asset_ids[:100]]
        results_db = await asyncio.gather(*tasks)
        
        assert all(status == 200 for status, _ in results_db)
        latencies_db = [t for _, t in results_db]
        
        # Cache Hits
        tasks = [fetch(ac, f"/api/v1/market/assets/{aid}/snapshot") for aid in asset_ids[:100]]
        results_cache = await asyncio.gather(*tasks)
        
        assert all(status == 200 for status, _ in results_cache)
        latencies_cache = [t for _, t in results_cache]
        
        import math
        def get_percentile(data: list[float], p: float) -> float:
            if not data:
                return 0.0
            s = sorted(data)
            k = (len(s) - 1) * p
            f = math.floor(k)
            c = math.ceil(k)
            if f == c:
                return s[int(k)]
            d0 = s[int(f)] * (c - k)
            d1 = s[int(c)] * (k - f)
            return d0 + d1
            
        print("\n--- Load Test Results ---")
        print("Simulated Assets: 10000")
        print("Concurrent Readers: 100")
        print("\nDatabase Path (Initial Load):")
        print("  Hit %: 100% DB, 0% Cache")
        print(f"  Retrieval Rate: {100 / sum(latencies_db):.2f} req/s")
        print(f"  P50 Latency: {get_percentile(latencies_db, 0.50)*1000:.2f} ms")
        print(f"  P95 Latency: {get_percentile(latencies_db, 0.95)*1000:.2f} ms")
        print(f"  Max Latency: {max(latencies_db)*1000:.2f} ms")
        
        print("\nCache Path (Warm Cache):")
        print("  Hit %: 0% DB, 100% Cache")
        print(f"  Retrieval Rate: {100 / sum(latencies_cache):.2f} req/s")
        print(f"  P50 Latency: {get_percentile(latencies_cache, 0.50)*1000:.2f} ms")
        print(f"  P95 Latency: {get_percentile(latencies_cache, 0.95)*1000:.2f} ms")
        print(f"  Max Latency: {max(latencies_cache)*1000:.2f} ms")

