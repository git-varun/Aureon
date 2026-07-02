import uuid
from typing import Generator

import pytest
from pytest import MonkeyPatch
from sqlalchemy import select

from app.core.database import SessionLocal, engine
from app.domain.entities.base import Base
from app.domain.entities.market import AssetSnapshot, LatestQuote
from app.workers.ingestion.tasks import ingest_quote


@pytest.fixture
def clean_db() -> Generator[None, None, None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield

def test_quote_to_snapshot_flow(clean_db: None, monkeypatch: MonkeyPatch) -> None:
    from datetime import datetime, timezone
    from decimal import Decimal

    from app.domain.services.providers.models import NormalizedQuote
    from app.infrastructure.providers.finnhub import FinnhubAdapter

    # Mock cache calls
    monkeypatch.setattr("app.workers.ingestion.tasks.cache_quote", lambda *args, **kwargs: None)
    monkeypatch.setattr("app.workers.snapshots.asset_snapshot.cache_asset_snapshot", lambda *args, **kwargs: None)
    monkeypatch.setattr("app.workers.evaluation.features.cache_asset_features", lambda *args, **kwargs: None)
    monkeypatch.setattr("app.workers.evaluation.scoring.cache_asset_scores", lambda *args, **kwargs: None)
    monkeypatch.setattr("app.workers.monitoring.asset_health.cache_asset_health", lambda *args, **kwargs: None)

    def mock_get_quote(self, symbol: str):
        return NormalizedQuote(
            symbol=symbol,
            provider="finnhub",
            timestamp=datetime.now(timezone.utc),
            price=Decimal("150.00"),
            volume=Decimal("1000"),
        )

    monkeypatch.setattr(FinnhubAdapter, "get_quote", mock_get_quote)

    symbol = "TSLA"
    result = ingest_quote("finnhub", symbol)
    assert result is True

    db = SessionLocal()
    try:
        # Check LatestQuote exists
        quote = db.scalar(select(LatestQuote).filter_by(symbol=symbol))
        assert quote is not None
        assert float(quote.price) == 150.0  # Mock Finnhub quote price is 150.0

        # Check AssetSnapshot is automatically created
        asset_id = uuid.uuid5(uuid.NAMESPACE_DNS, symbol)
        snapshot = db.scalar(select(AssetSnapshot).filter_by(asset_id=asset_id))
        assert snapshot is not None
        assert snapshot.price is not None
        assert float(snapshot.price) == 150.0
    finally:
        db.close()
