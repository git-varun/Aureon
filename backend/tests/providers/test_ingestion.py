from typing import Any

from pytest import MonkeyPatch
from sqlalchemy import select

from app.core.database import SessionLocal
from app.domain.entities.market import LatestQuote
from app.domain.entities.system import FailedIngestion, Provider, ProviderUsage
from app.workers.ingestion.tasks import ingest_quote


def test_successful_ingestion(monkeypatch: MonkeyPatch) -> None:
    from app.core.database import engine
    from app.domain.entities.base import Base
    Base.metadata.create_all(engine)
    
    # Mock cache_quote to verify it is called
    cache_called = False
    
    def mock_cache_quote(asset_id: str, data: dict[str, Any]) -> None:
        nonlocal cache_called
        cache_called = True
        
    monkeypatch.setattr("app.workers.ingestion.tasks.cache_quote", mock_cache_quote)
    
    result = ingest_quote("finnhub", "AAPL")
    assert result is True
    assert cache_called is True
    
    db = SessionLocal()
    try:
        quote = db.scalar(select(LatestQuote).filter_by(symbol="AAPL"))
        assert quote is not None
        assert float(quote.price) == 150.00
        
        provider = db.scalar(select(Provider).filter_by(name="finnhub"))
        assert provider is not None
        assert provider.health_status == "healthy"
        
        usage = db.scalar(select(ProviderUsage).filter_by(provider_id=provider.id))
        assert usage is not None
        assert usage.endpoint == "get_quote"
        
    finally:
        db.close()

def test_failed_ingestion(monkeypatch: MonkeyPatch) -> None:
    from app.core.database import engine
    from app.domain.entities.base import Base
    Base.metadata.create_all(engine)
    
    from app.infrastructure.providers.finnhub import FinnhubAdapter
    
    def mock_get_quote(self: Any, symbol: str) -> Any:
        raise ValueError("Simulated network error")
    
    monkeypatch.setattr(FinnhubAdapter, "get_quote", mock_get_quote)
    
    result = ingest_quote("finnhub", "FAIL")
    assert result is False
    
    db = SessionLocal()
    try:
        failure = db.scalar(select(FailedIngestion).filter_by(provider="finnhub"))
        assert failure is not None
        assert "Simulated network error" in failure.error
        assert failure.payload["symbol"] == "FAIL"
    finally:
        db.close()
