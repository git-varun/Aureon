import uuid
from datetime import datetime, timezone
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert

from app.api.main import app
from app.core.database import SessionLocal, engine
from app.domain.entities.base import Base
from app.domain.entities.evaluation import AssetScore, FeatureSnapshot
from app.domain.entities.market import AssetFeatures, AssetSnapshot, LatestQuote
from app.workers.evaluation.features import generate_features
from app.workers.evaluation.validation import ValidationError, validate_features

client = TestClient(app)

@pytest.fixture(scope="module")
def setup_eval_data() -> Generator[uuid.UUID, None, None]:
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    asset_id = uuid.uuid4()
    
    session.execute(insert(LatestQuote).values(
        symbol=str(asset_id),
        asset_id=asset_id,
        price=150.0,
        volume=1000
    ))
    
    session.execute(insert(AssetSnapshot).values(
        asset_id=asset_id,
        price=150.0,
        market_cap=1000000.0,
        pe_ratio=15.0,
        rsi=45.0,
        momentum_score=None,
        volatility_score=None,
        sentiment_score=None,
        payload={},
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc)
    ))
    session.commit()
    yield asset_id
    
    session.query(AssetScore).delete()
    session.query(FeatureSnapshot).delete()
    session.query(AssetFeatures).delete()
    session.query(AssetSnapshot).delete()
    session.query(LatestQuote).delete()
    session.commit()
    session.close()

def test_feature_validation() -> None:
    # Valid features
    valid = {"price": 100.0, "market_cap": None}
    validate_features(valid)
    
    # Missing required
    with pytest.raises(ValidationError):
        validate_features({"market_cap": 100.0})
        
    # Out of range
    with pytest.raises(ValidationError):
        validate_features({"price": -10.0})
        
    # Outlier
    with pytest.raises(ValidationError):
        validate_features({"price": 2000000000.0})

def test_feature_generation_pipeline(setup_eval_data: uuid.UUID) -> None:
    asset_id = setup_eval_data
    
    # Generate features (also triggers scoring inside)
    generate_features(asset_id)
    
    session = SessionLocal()
    
    # Verify Asset Features
    features = session.query(AssetFeatures).filter_by(asset_id=asset_id).first()
    assert features is not None
    assert features.price == 150.0
    assert features.market_cap == 1000000.0
    
    # Verify Asset Score
    score = session.query(AssetScore).filter_by(asset_id=asset_id).first()
    assert score is not None
    assert score.model_version == "v1.0.0"
    assert score.recommendation_score > 0
    
    # Verify Feature Snapshot
    snapshot = session.query(FeatureSnapshot).filter_by(asset_id=asset_id).first()
    assert snapshot is not None
    assert snapshot.model_version == "v1.0.0"
    assert "price" in snapshot.features
    
    session.close()

def test_api_retrieval(setup_eval_data: uuid.UUID) -> None:
    asset_id = setup_eval_data
    
    # Test Features API
    response = client.get(f"/api/v1/market/assets/{asset_id}/features")
    assert response.status_code == 200
    data = response.json()
    assert data["price"] == 150.0
    
    # Test Scores API
    response = client.get(f"/api/v1/evaluation/assets/{asset_id}/scores")
    assert response.status_code == 200
    data = response.json()
    assert data["model_version"] == "v1.0.0"
    assert "recommendation_score" in data
