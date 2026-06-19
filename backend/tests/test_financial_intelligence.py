import uuid
from datetime import datetime, timedelta, timezone
from typing import Generator

import pytest

from app.core.database import SessionLocal, engine
from app.domain.entities.base import Base
from app.domain.entities.evaluation import AssetScore
from app.domain.entities.market import (
    Asset,
    AssetFeatures,
    AssetSnapshot,
    LatestQuote,
    PriceHistory,
)
from app.domain.entities.portfolio import (
    Portfolio,
    PortfolioSnapshot,
    Position,
    Transaction,
)
from app.domain.entities.recommendation import Recommendation, RecommendationOutcome
from app.domain.entities.system import Organization, OrganizationMember, User
from app.domain.services.intelligence import FinancialIntelligenceService


@pytest.fixture
def clean_db() -> Generator[None, None, None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield

@pytest.fixture
def setup_intelligence_data(clean_db):
    session = SessionLocal()
    
    # 1. Create User, Org, and Portfolio
    user = User(
        id=uuid.uuid4(),
        email="varun.upadhyay911@gmail.com",
        password_hash="testpass",
        first_name="Varun",
        last_name="Upadhyay",
        is_active=True,
        is_verified=True
    )
    session.add(user)
    
    org = Organization(id=uuid.uuid4(), name="Varun Org", slug="varun-org")
    session.add(org)
    
    member = OrganizationMember(organization_id=org.id, user_id=user.id, role="OWNER")
    session.add(member)
    
    portfolio = Portfolio(id=uuid.uuid4(), name="Default Portfolio", organization_id=org.id)
    session.add(portfolio)
    session.flush()
    
    # 2. Create Assets
    asset_stock_id = uuid.uuid4()
    asset_stock = Asset(
        id=asset_stock_id,
        symbol="AAPL",
        name="Apple Inc.",
        asset_class="stocks",
        metadata_payload={"sector": "Tech", "currency": "USD"}
    )
    session.add(asset_stock)
    
    asset_crypto_id = uuid.uuid4()
    asset_crypto = Asset(
        id=asset_crypto_id,
        symbol="BTC",
        name="Bitcoin",
        asset_class="crypto",
        metadata_payload={"sector": "Crypto", "currency": "USD"}
    )
    session.add(asset_crypto)
    session.flush()
    
    # 3. Create LatestQuotes
    quote_stock = LatestQuote(symbol="AAPL", asset_id=asset_stock_id, price=180.0, volume=10000.0)
    session.add(quote_stock)
    quote_crypto = LatestQuote(symbol="BTC", asset_id=asset_crypto_id, price=60000.0, volume=500.0)
    session.add(quote_crypto)
    
    # 4. Create PriceHistory for performance calculation
    # We create price history around T0 = 60 days ago
    t0 = datetime.now(timezone.utc) - timedelta(days=60)
    # T0 prices
    session.add(PriceHistory(asset_id=asset_stock_id, symbol="AAPL", price=150.0, timestamp=t0))
    session.add(PriceHistory(asset_id=asset_crypto_id, symbol="BTC", price=50000.0, timestamp=t0))
    
    # T0 + 30d prices (30 days ago)
    t30 = t0 + timedelta(days=30)
    session.add(PriceHistory(asset_id=asset_stock_id, symbol="AAPL", price=165.0, timestamp=t30))
    session.add(PriceHistory(asset_id=asset_crypto_id, symbol="BTC", price=55000.0, timestamp=t30))
    
    # T0 + 60d (current prices)
    session.add(PriceHistory(asset_id=asset_stock_id, symbol="AAPL", price=180.0, timestamp=datetime.now(timezone.utc)))
    session.add(PriceHistory(asset_id=asset_crypto_id, symbol="BTC", price=60000.0, timestamp=datetime.now(timezone.utc)))
    
    # 5. Create Snapshots, Features and Scores
    snap_stock = AssetSnapshot(asset_id=asset_stock_id, price=180.0, market_cap=2000000000.0, pe_ratio=28.0, rsi=55.0, payload={})
    session.add(snap_stock)
    
    features_stock = AssetFeatures(
        asset_id=asset_stock_id,
        price=180.0,
        market_cap=2000000000.0,
        momentum_score=0.82,
        volatility_score=0.24,
        sentiment_score=0.77
    )
    session.add(features_stock)
    
    score_stock = AssetScore(
        asset_id=asset_stock_id,
        model_version="v2.0.0",
        recommendation_score=0.85,
        quality_score=0.80,
        valuation_score=0.75
    )
    session.add(score_stock)
    
    # 6. Create Positions (total asset value = 2 * 180 + 0.1 * 60000 = 360 + 6000 = 6360)
    pos_stock = Position(portfolio_id=portfolio.id, symbol="AAPL", asset_id=asset_stock_id, quantity=2.0, avg_buy_price=150.0)
    session.add(pos_stock)
    
    pos_crypto = Position(portfolio_id=portfolio.id, symbol="BTC", asset_id=asset_crypto_id, quantity=0.1, avg_buy_price=50000.0)
    session.add(pos_crypto)
    
    # 7. Create PortfolioSnapshot with cash balance
    snap = PortfolioSnapshot(
        portfolio_id=portfolio.id,
        market_value=6360.0,
        cash_balance=1000.0,
        allocation={"stocks": 360.0/7360.0, "crypto": 6000.0/7360.0}
    )
    # Mocking daily return on snapshot
    snap.daily_return = 150.0
    session.add(snap)
    
    # 8. Create Recommendations & Outcomes (1 applied, 1 dismissed, 1 active)
    rec1_id = uuid.uuid4()
    rec1 = Recommendation(
        id=rec1_id,
        organization_id=org.id,
        asset_id=asset_stock_id,
        recommendation_state="BUY",
        confidence_score=0.85,
        status="applied",
        version="v2.0.0"
    )
    rec1.created_at = t0
    session.add(rec1)
    
    out1 = RecommendationOutcome(
        recommendation_id=rec1_id,
        status="applied",
        action_taken_at=t0 + timedelta(days=1),
        realized_impact=0.10, # 10% return
        predicted_impact=0.15
    )
    session.add(out1)
    
    rec2_id = uuid.uuid4()
    rec2 = Recommendation(
        id=rec2_id,
        organization_id=org.id,
        asset_id=asset_crypto_id,
        recommendation_state="BUY",
        confidence_score=0.45,
        status="dismissed",
        version="v2.0.0"
    )
    rec2.created_at = t0
    session.add(rec2)
    
    out2 = RecommendationOutcome(
        recommendation_id=rec2_id,
        status="dismissed",
        dismiss_reason="too volatile",
        action_taken_at=t0 + timedelta(days=2)
    )
    session.add(out2)
    
    rec3_id = uuid.uuid4()
    rec3 = Recommendation(
        id=rec3_id,
        organization_id=org.id,
        asset_id=asset_stock_id,
        recommendation_state="HOLD",
        confidence_score=0.65,
        status="active",
        version="v2.0.0"
    )
    rec3.created_at = datetime.now(timezone.utc)
    session.add(rec3)
    
    # Add a Transaction in the past 90 days
    txn = Transaction(
        id=uuid.uuid4(),
        portfolio_id=portfolio.id,
        symbol="AAPL",
        asset_id=asset_stock_id,
        transaction_type="BUY",
        quantity=2.0,
        price=150.0,
        transaction_date=t0
    )
    session.add(txn)
    
    session.commit()
    
    yield {
        "user_id": user.id,
        "organization_id": org.id,
        "portfolio_id": portfolio.id,
        "rec1_id": rec1_id
    }
    
    session.close()

def test_recommendation_intelligence(setup_intelligence_data):
    org_id = setup_intelligence_data["organization_id"]
    rec1_id = setup_intelligence_data["rec1_id"]
    
    session = SessionLocal()
    service = FinancialIntelligenceService(session)
    
    # Test Recommendation Quality Metrics
    metrics = service.get_recommendation_quality_metrics(org_id)
    assert metrics["total_recommendations"] == 3
    assert metrics["accepted_count"] == 1
    assert metrics["dismissed_count"] == 1
    assert metrics["acceptance_rate"] == round(1/3, 4)
    assert metrics["dismissal_rate"] == round(1/3, 4)
    assert metrics["execution_rate"] == 0.5
    
    # Test Recommendation Performance
    perf = service.get_recommendation_performance(org_id)
    assert len(perf) == 3
    for p in perf:
        if p["recommendation_id"] == str(rec1_id):
            assert p["symbol"] == "AAPL"
            # 30d price of AAPL is 165, p0 is 150 -> realized return is 0.10 (10%)
            assert p["realized_return_30d"] == 0.10
            
    # Test Explainability V2
    explanation = service.get_recommendation_explainability_v2(rec1_id)
    assert "Momentum: 0.82" in explanation
    assert "Sentiment: 0.77" in explanation
    assert "Volatility: 0.24" in explanation
    assert "Recommendation Score: 0.85" in explanation
    
    session.close()

def test_portfolio_intelligence(setup_intelligence_data):
    portfolio_id = setup_intelligence_data["portfolio_id"]
    
    session = SessionLocal()
    service = FinancialIntelligenceService(session)
    
    # Test Concentration Analysis
    concen = service.get_portfolio_concentration_analysis(portfolio_id)
    # BTC value = 0.1 * 60000 = 6000. Total value = 6360. BTC is ~94% -> exceeds 15%
    assert len(concen["warnings"]) > 0
    assert any("BTC" in w for w in concen["warnings"])
    
    # Test Diversification Score
    div = service.get_portfolio_diversification_score(portfolio_id)
    assert "diversification_score" in div
    assert div["asset_count_score"] == 20.0  # 2 assets * 10
    
    # Test Risk Summary
    risk = service.get_portfolio_risk_summary(portfolio_id)
    assert risk["risk_class"] == "HIGH RISK"  # BTC is ~94% of holdings
    
    # Test Cash Deployment Opportunities
    cash_opp = service.get_cash_deployment_opportunities(portfolio_id)
    assert len(cash_opp["suggestions"]) > 0
    
    session.close()

def test_outcome_intelligence(setup_intelligence_data):
    org_id = setup_intelligence_data["organization_id"]
    
    session = SessionLocal()
    service = FinancialIntelligenceService(session)
    
    # Test Scorecard
    card = service.get_recommendation_scorecard(org_id)
    assert card["BUY"]["generated"] == 2
    assert card["BUY"]["accepted"] == 1
    assert card["BUY"]["win_rate"] == 1.0  # outcome realized return is 0.10 > 0
    
    # Test Rule Performance
    rules = service.get_rule_performance(org_id)
    assert rules["BUY"]["win_rate"] == 1.0
    assert rules["BUY"]["average_return"] == 0.10
    
    # Test Calibration
    calib = service.get_confidence_calibration(org_id)
    assert calib["high"]["win_rate"] == 1.0  # rec1 confidence = 0.85
    assert calib["low"]["total_recommendations"] == 1  # rec2 confidence = 0.45
    
    session.close()

def test_briefing_quality(setup_intelligence_data):
    org_id = setup_intelligence_data["organization_id"]
    portfolio_id = setup_intelligence_data["portfolio_id"]
    
    session = SessionLocal()
    service = FinancialIntelligenceService(session)
    
    # Daily
    daily = service.get_daily_briefing(org_id, portfolio_id)
    assert daily["new_recommendations"] == 1
    assert daily["portfolio_value"] == 7360.0
    
    # Weekly
    weekly = service.get_weekly_briefing(org_id, portfolio_id)
    assert weekly["weekly_return_percentage"] == 2.4
    
    # Monthly
    monthly = service.get_monthly_briefing(org_id, portfolio_id)
    assert len(monthly["allocation_drift"]) > 0
    
    session.close()

def test_financial_health_and_goals(setup_intelligence_data):
    org_id = setup_intelligence_data["organization_id"]
    portfolio_id = setup_intelligence_data["portfolio_id"]
    user_id = setup_intelligence_data["user_id"]
    
    session = SessionLocal()
    service = FinancialIntelligenceService(session)
    
    # Health Score
    health = service.get_investor_health_score(portfolio_id, org_id)
    assert "investor_health_score" in health
    
    # Goal Metrics
    goals = service.get_goal_progress_metrics(portfolio_id, org_id, user_id)
    assert goals["wealth_goals"]["current_net_worth"] == 7360.0
    assert goals["wealth_goals"]["projected_months_to_target"] > 0
    
    session.close()
