import uuid
from typing import Generator

import pytest
from pytest import MonkeyPatch
from sqlalchemy import select

from app.core.database import SessionLocal, engine
from app.domain.entities.base import Base
from app.domain.entities.evaluation import AssetScore, FeatureSnapshot
from app.domain.entities.market import AssetFeatures, AssetSnapshot, LatestQuote
from app.workers.evaluation.features import generate_features


@pytest.fixture
def clean_db() -> Generator[None, None, None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield

def test_features_to_scores_flow(clean_db: None, monkeypatch: MonkeyPatch) -> None:
    # Mock cache calls
    monkeypatch.setattr("app.workers.evaluation.features.cache_asset_features", lambda *args, **kwargs: None)
    monkeypatch.setattr("app.workers.evaluation.scoring.cache_asset_scores", lambda *args, **kwargs: None)
    monkeypatch.setattr("app.workers.monitoring.asset_health.cache_asset_health", lambda *args, **kwargs: None)

    symbol = "AMZN"
    asset_id = uuid.uuid5(uuid.NAMESPACE_DNS, symbol)

    db = SessionLocal()
    try:
        # Manually insert LatestQuote and AssetSnapshot
        db.add(LatestQuote(symbol=symbol, asset_id=asset_id, price=100.0, volume=1000.0))
        db.add(AssetSnapshot(asset_id=asset_id, price=100.0, market_cap=5000000.0, pe_ratio=20.0, rsi=50.0))
        db.commit()
    finally:
        db.close()

    # Generate features (which should trigger scoring)
    generate_features(asset_id)

    db = SessionLocal()
    try:
        # Check AssetFeatures is created
        features = db.scalar(select(AssetFeatures).filter_by(asset_id=asset_id))
        assert features is not None
        assert features.price is not None
        assert float(features.price) == 100.0

        # Check AssetScore is created
        score = db.scalar(select(AssetScore).filter_by(asset_id=asset_id))
        assert score is not None
        assert score.model_version == "v1.0.0"
        assert float(score.recommendation_score) > 0.0

        # Check FeatureSnapshot is created
        f_snapshot = db.scalar(select(FeatureSnapshot).filter_by(asset_id=asset_id))
        assert f_snapshot is not None
        assert f_snapshot.model_version == "v1.0.0"
        assert "price" in f_snapshot.features
    finally:
        db.close()
