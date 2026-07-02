import uuid
from typing import Generator

import pytest
from pytest import MonkeyPatch
from sqlalchemy import select

from app.core.database import SessionLocal, engine
from app.domain.entities.base import Base
from app.domain.entities.market import Asset, AssetFeatures, AssetSnapshot, LatestQuote
from app.workers.snapshots.asset_snapshot import process_asset_snapshot


@pytest.fixture
def clean_db() -> Generator[None, None, None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield

def test_snapshot_to_features_flow(clean_db: None, monkeypatch: MonkeyPatch) -> None:
    # Mock cache calls
    monkeypatch.setattr("app.workers.snapshots.asset_snapshot.cache_asset_snapshot", lambda *args, **kwargs: None)
    monkeypatch.setattr("app.workers.evaluation.features.cache_asset_features", lambda *args, **kwargs: None)
    monkeypatch.setattr("app.workers.evaluation.scoring.cache_asset_scores", lambda *args, **kwargs: None)
    monkeypatch.setattr("app.workers.monitoring.asset_health.cache_asset_health", lambda *args, **kwargs: None)

    symbol = "MSFT"
    asset_id = uuid.uuid5(uuid.NAMESPACE_DNS, symbol)

    db = SessionLocal()
    try:
        # Manually insert Asset + LatestQuote with asset_id
        db.add(Asset(id=asset_id, symbol=symbol, name=symbol, asset_class="equity"))
        db.add(LatestQuote(symbol=symbol, asset_id=asset_id, price=300.0, volume=5000))
        db.commit()
    finally:
        db.close()

    # Process snapshot (which should chain-trigger generate_features)
    process_asset_snapshot(asset_id)

    db = SessionLocal()
    try:
        # Check AssetSnapshot is created
        snapshot = db.scalar(select(AssetSnapshot).filter_by(asset_id=asset_id))
        assert snapshot is not None
        assert snapshot.price is not None
        assert float(snapshot.price) == 300.0

        # Check AssetFeatures is created
        features = db.scalar(select(AssetFeatures).filter_by(asset_id=asset_id))
        assert features is not None
        assert features.price is not None
        assert float(features.price) == 300.0
    finally:
        db.close()
