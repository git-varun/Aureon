import uuid
from typing import Generator

import pytest
from fastapi.testclient import TestClient

from app.api.main import app
from app.core.database import SessionLocal, engine
from app.domain.entities.base import Base
from app.domain.entities.evaluation import AssetScore
from app.domain.entities.market import AssetFeatures, AssetSnapshot, LatestQuote
from app.domain.entities.portfolio import Portfolio, Transaction
from app.domain.entities.recommendation import (
    Recommendation,
    RecommendationExplanation,
    RecommendationOutcome,
)
from app.domain.entities.system import Organization, OrganizationMember, User
from app.domain.services.recommendation import RecommendationService

client = TestClient(app)

@pytest.fixture
def clean_db() -> Generator[None, None, None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield

@pytest.fixture
def setup_recommendation_data(clean_db):
    session = SessionLocal()
    
    # 1. Create User, Org, and Portfolio
    user = User(
        id=uuid.uuid4(),
        email="test_rec@example.com",
        password_hash="testpass",
        is_active=True,
        is_verified=True
    )
    session.add(user)
    
    org = Organization(id=uuid.uuid4(), name="Test Org", slug="test-org")
    session.add(org)
    session.flush()

    member = OrganizationMember(organization_id=org.id, user_id=user.id, role="ADMIN")
    session.add(member)

    portfolio = Portfolio(id=uuid.uuid4(), name="Test Portfolio", organization_id=org.id)
    session.add(portfolio)

    # 2. Create Asset, LatestQuote, AssetSnapshot
    asset_id = uuid.uuid4()
    quote = LatestQuote(symbol="TEST_ASSET", asset_id=asset_id, price=100.0, volume=5000.0)
    session.add(quote)

    snapshot = AssetSnapshot(
        asset_id=asset_id,
        price=100.0,
        market_cap=1000000.0,
        pe_ratio=15.0,
        rsi=45.0,
        payload={}
    )
    session.add(snapshot)
    session.flush()

    # Create Features and Scores matching BUY rule: valuation >= 0.7, momentum >= 0.5, sentiment >= 0.5
    features = AssetFeatures(
        asset_id=asset_id,
        price=100.0,
        market_cap=1000000.0,
        momentum_score=0.6,
        volatility_score=0.2,
        sentiment_score=0.7
    )
    session.add(features)
    
    score = AssetScore(
        asset_id=asset_id,
        model_version="v1.0.0",
        recommendation_score=0.8,
        quality_score=0.9,
        valuation_score=0.85
    )
    session.add(score)
    
    session.commit()
    
    yield {
        "user_id": user.id,
        "organization_id": org.id,
        "portfolio_id": portfolio.id,
        "asset_id": asset_id,
        "symbol": "TEST_ASSET"
    }
    
    session.close()

def test_recommendation_generation_and_rules(setup_recommendation_data):
    org_id = setup_recommendation_data["organization_id"]
    
    session = SessionLocal()
    service = RecommendationService(session)
    
    # Generate recommendations
    recs = service.generate_recommendations(org_id)
    assert len(recs) == 1
    rec = recs[0]
    
    assert rec["recommendation_state"] == "BUY"
    assert rec["status"] == "active"
    assert rec["version"] == "v2.0.0"
    assert rec["explanation"]["rules_matched"] == {"underpricing_and_momentum": True}
    
    # Verify DB persistence
    db_rec = session.query(Recommendation).filter_by(organization_id=org_id).first()
    assert db_rec is not None
    assert db_rec.recommendation_state == "BUY"
    
    db_expl = session.query(RecommendationExplanation).filter_by(recommendation_id=db_rec.id).first()
    assert db_expl is not None
    assert db_expl.reasoning == rec["explanation"]["reasoning"]
    
    db_out = session.query(RecommendationOutcome).filter_by(recommendation_id=db_rec.id).first()
    assert db_out is not None
    assert db_out.status == "active"
    
    session.close()

def test_apply_dismiss_undo_flow(setup_recommendation_data):
    org_id = setup_recommendation_data["organization_id"]
    portfolio_id = setup_recommendation_data["portfolio_id"]
    
    session = SessionLocal()
    service = RecommendationService(session)
    
    # Generate first
    recs = service.generate_recommendations(org_id)
    rec_id = uuid.UUID(recs[0]["id"])
    
    # Apply
    applied = service.apply_recommendation(rec_id, portfolio_id=portfolio_id)
    assert applied["status"] == "applied"
    assert applied["outcome"]["status"] == "applied"
    assert applied["outcome"]["ledger_transaction_id"] is not None
    
    # Verify transaction in DB
    txn_id = uuid.UUID(applied["outcome"]["ledger_transaction_id"])
    txn = session.query(Transaction).filter_by(id=txn_id).first()
    assert txn is not None
    assert txn.transaction_type == "BUY"
    
    # Undo
    undone = service.undo_recommendation(rec_id)
    assert undone["status"] == "active"
    assert undone["outcome"]["status"] == "active"
    assert undone["outcome"]["ledger_transaction_id"] is None
    
    # Verify transaction was removed
    txn = session.query(Transaction).filter_by(id=txn_id).first()
    assert txn is None
    
    # Dismiss
    dismissed = service.dismiss_recommendation(rec_id, reason="Too risky")
    assert dismissed["status"] == "dismissed"
    assert dismissed["outcome"]["status"] == "dismissed"
    assert dismissed["outcome"]["dismiss_reason"] == "Too risky"
    
    session.close()

def test_api_recommendation_endpoints(setup_recommendation_data):
    user_id = setup_recommendation_data["user_id"]
    org_id = setup_recommendation_data["organization_id"]
    portfolio_id = setup_recommendation_data["portfolio_id"]
    
    # Mock current user authentication dependency override
    from app.api.dependencies import get_current_user
    session = SessionLocal()
    user = session.query(User).filter_by(id=user_id).first()
    app.dependency_overrides[get_current_user] = lambda: user
    
    try:
        # 1. Generate via API
        resp = client.post(f"/api/v1/recommendation/organizations/{org_id}/recommendations/generate")
        assert resp.status_code == 201
        data = resp.json()
        assert len(data) == 1
        rec_id = data[0]["id"]
        
        # 2. List active
        resp = client.get(f"/api/v1/recommendation/organizations/{org_id}/recommendations?status=active")
        assert resp.status_code == 200
        assert len(resp.json()) == 1
        
        # 3. Apply via API
        resp = client.post(f"/api/v1/recommendation/organizations/{org_id}/recommendations/{rec_id}/apply?portfolio_id={portfolio_id}")
        assert resp.status_code == 200
        assert resp.json()["status"] == "applied"
        
        # 4. Undo via API
        resp = client.post(f"/api/v1/recommendation/organizations/{org_id}/recommendations/{rec_id}/undo")
        assert resp.status_code == 200
        assert resp.json()["status"] == "active"
        
        # 5. Dismiss via API
        resp = client.post(f"/api/v1/recommendation/organizations/{org_id}/recommendations/{rec_id}/dismiss?reason=duplicate")
        assert resp.status_code == 200
        assert resp.json()["status"] == "dismissed"
        assert resp.json()["outcome"]["dismiss_reason"] == "duplicate"
    finally:
        app.dependency_overrides.clear()
        session.close()
