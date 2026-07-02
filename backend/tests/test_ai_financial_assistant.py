import os
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.api.main import app
from app.core.database import SessionLocal, engine
from app.domain.entities.ai import AIBriefing, AIEvaluation, AIGeneration
from app.domain.entities.base import Base
from app.domain.entities.evaluation import AssetScore
from app.domain.entities.market import AssetFeatures, AssetSnapshot, LatestQuote
from app.domain.entities.news import News
from app.domain.entities.portfolio import Portfolio, Position, Transaction
from app.domain.entities.recommendation import Recommendation, RecommendationExplanation
from app.domain.entities.system import Organization, OrganizationMember, User
from app.domain.services.ai import AIService, PortfolioContextBuilder
from app.infrastructure.repositories import (
    OrganizationMembersRepository,
    OrganizationsRepository,
    SessionsRepository,
    UsersRepository,
)

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_mock_env():
    os.environ["AUREON_TEST_MOCK_AI"] = "true"
    yield
    if "AUREON_TEST_MOCK_AI" in os.environ:
        del os.environ["AUREON_TEST_MOCK_AI"]

@pytest.fixture
def clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield

@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Auth Helper ---
def get_auth_headers(db_session, email="admin@test.com", role="OWNER"):
    users_repo = UsersRepository(db_session)
    orgs_repo = OrganizationsRepository(db_session)
    members_repo = OrganizationMembersRepository(db_session)
    
    user = users_repo.get_by_email(email)
    if not user:
        from app.core.security import hash_password
        user = User(email=email, password_hash=hash_password("password123"), is_active=True, is_verified=True)
        users_repo.create(user)
    
    org = db_session.scalar(select(Organization).filter_by(slug="test-org"))
    if not org:
        org = Organization(name="Test Org", slug="test-org")
        orgs_repo.create(org)
        db_session.flush()
        
    member = members_repo.get_by_org_and_user(org.id, user.id)
    if not member:
        member = OrganizationMember(organization_id=org.id, user_id=user.id, role=role)
        members_repo.create(member)
        db_session.flush()
        
    db_session.commit()
    
    from datetime import timedelta

    from app.domain.entities.system import UserSession
    sessions_repo = SessionsRepository(db_session)
    sess_token = f"token-{uuid.uuid4()}"
    user_sess = UserSession(
        user_id=user.id,
        session_token=sess_token,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1)
    )
    sessions_repo.create(user_sess)
    db_session.commit()
    
    return {"Authorization": f"Bearer {sess_token}"}, user, org

# ── Tests ─────────────────────────────────────────────────────────────────────

def test_context_builder_generates_correct_payload(clean_db, db_session):
    headers, user, org = get_auth_headers(db_session)
    
    # 1. Setup Portfolio & Assets
    portfolio = Portfolio(id=uuid.uuid4(), name="Primary Equity", organization_id=org.id)
    db_session.add(portfolio)
    db_session.flush()
    
    asset_id = uuid.uuid5(uuid.NAMESPACE_DNS, "AAPL")
    quote = LatestQuote(symbol="AAPL", asset_id=asset_id, price=180.0, volume=1000)
    db_session.add(quote)
    
    # downstream metadata requirements
    snap_aapl = AssetSnapshot(asset_id=asset_id, price=180.0, market_cap=3000000000000.0, pe_ratio=28.5, rsi=55.0, payload={"macd": 1.2})
    db_session.add(snap_aapl)
    db_session.flush()
    
    features = AssetFeatures(asset_id=asset_id, price=180.0, momentum_score=0.7, volatility_score=0.3, sentiment_score=0.6)
    score = AssetScore(asset_id=asset_id, model_version="v2.0.0", recommendation_score=0.8, quality_score=0.9, valuation_score=0.7)
    db_session.add(features)
    db_session.add(score)
    
    position = Position(id=uuid.uuid4(), portfolio_id=portfolio.id, symbol="AAPL", asset_id=asset_id, quantity=10, avg_buy_price=150.0)
    db_session.add(position)
    
    transaction = Transaction(
        id=uuid.uuid4(), portfolio_id=portfolio.id, symbol="AAPL", asset_id=asset_id,
        transaction_type="BUY", quantity=10, price=150.0, fees=0.0, taxes=0.0, kind="trade",
        transaction_date=datetime.now(timezone.utc)
    )
    db_session.add(transaction)
    
    news = News(title="AAPL earnings smash expectations", source="Bloomberg", url="https://bloomberg.com/aapl", symbols="AAPL")
    db_session.add(news)
    
    db_session.commit()
    
    # 2. Build context
    ctx = PortfolioContextBuilder.build_global_context(db_session, org.id)
    assert "AAPL" in ctx
    assert "Qty Owned: 10.0" in ctx
    assert "Avg Cost: 150.00" in ctx
    assert "RSI: 55.00" in ctx
    assert "Valuation Score: 0.70" in ctx
    assert "AAPL earnings smash expectations" in ctx

def test_ai_service_generates_briefings_and_observability(clean_db, db_session):
    headers, user, org = get_auth_headers(db_session)
    
    portfolio = Portfolio(id=uuid.uuid4(), name="Primary Equity", organization_id=org.id)
    db_session.add(portfolio)
    db_session.commit()
    
    ai_svc = AIService(db_session)
    
    # 1. Global Briefing
    briefing = ai_svc.generate_briefing(org.id, "global", user_id=user.id)
    assert briefing["market_vibe"] is not None
    assert len(briefing["directives"]) > 0
    assert briefing["directives"][0]["action"] in ("BUY", "HOLD", "REDUCE", "AVOID")
    
    # Verify AIBriefing record exists
    briefing_rec = db_session.query(AIBriefing).filter(AIBriefing.organization_id == org.id, AIBriefing.briefing_type == "global").first()
    assert briefing_rec is not None
    
    # Verify AIGeneration observability log exists
    gen_rec = db_session.query(AIGeneration).filter(AIGeneration.feature_name == "global").first()
    assert gen_rec is not None
    assert gen_rec.user_id == user.id
    
    # Verify AIEvaluation check records exist
    eval_rec = db_session.query(AIEvaluation).filter(AIEvaluation.generation_id == gen_rec.id).first()
    assert eval_rec is not None
    assert eval_rec.faithfulness_score is not None

def test_ai_service_ask_aureon_and_recommendation_explanations(clean_db, db_session):
    headers, user, org = get_auth_headers(db_session)
    
    asset_id = uuid.uuid5(uuid.NAMESPACE_DNS, "AAPL")
    quote = LatestQuote(symbol="AAPL", asset_id=asset_id, price=180.0, volume=1000)
    db_session.add(quote)
    db_session.add(AssetSnapshot(asset_id=asset_id, price=180.0))

    rec = Recommendation(
        id=uuid.uuid4(), organization_id=org.id, asset_id=asset_id,
        recommendation_state="BUY", confidence_score=0.85, status="active"
    )
    db_session.add(rec)
    db_session.commit()

    ai_svc = AIService(db_session)

    # 1. Recommendation Explanation
    explanation = ai_svc.explain_recommendation(rec.id, user_id=user.id)
    assert "reasoning" in explanation
    assert "rules_matched" in explanation
    
    # Verify database was updated
    expl_rec = db_session.query(RecommendationExplanation).filter(RecommendationExplanation.recommendation_id == rec.id).first()
    assert expl_rec is not None
    assert "valuation" in expl_rec.reasoning.lower() or "rsi" in expl_rec.reasoning.lower()
    
    # 2. Ask Aureon QA
    answer = ai_svc.ask_aureon("recommendation", rec.id, "Why should I buy this asset?", user_id=user.id)
    assert len(answer) > 0

def test_api_ai_endpoints(clean_db, db_session):
    headers, user, org = get_auth_headers(db_session)
    
    asset_id = uuid.uuid5(uuid.NAMESPACE_DNS, "AAPL")
    quote = LatestQuote(symbol="AAPL", asset_id=asset_id, price=180.0, volume=1000)
    db_session.add(quote)
    db_session.add(AssetSnapshot(asset_id=asset_id, price=180.0))

    rec = Recommendation(
        id=uuid.uuid4(), organization_id=org.id, asset_id=asset_id,
        recommendation_state="BUY", confidence_score=0.85, status="active"
    )
    db_session.add(rec)
    db_session.commit()

    # 1. Post Global Briefing
    res = client.post(f"/api/v1/organizations/{org.id}/ai/global", headers=headers)
    assert res.status_code == 200
    assert "market_vibe" in res.json()
    
    # 2. Post Weekly Briefing
    res = client.post(f"/api/v1/organizations/{org.id}/ai/weekly", headers=headers)
    assert res.status_code == 200
    assert "vibe" in res.json()
    
    # 3. Post Monthly Briefing
    res = client.post(f"/api/v1/organizations/{org.id}/ai/monthly", headers=headers)
    assert res.status_code == 200
    assert "vibe" in res.json()
    
    # 4. Post QA
    res = client.post(
        f"/api/v1/organizations/{org.id}/ai/qa",
        json={
            "context_type": "recommendation",
            "context_id": str(rec.id),
            "question": "What is the confidence of this recommendation?"
        },
        headers=headers
    )
    assert res.status_code == 200
    assert "response" in res.json()
    
    # 5. Post Explain
    res = client.post(f"/api/v1/organizations/{org.id}/ai/recommendations/{rec.id}/explain", headers=headers)
    assert res.status_code == 200
    assert "reasoning" in res.json()
