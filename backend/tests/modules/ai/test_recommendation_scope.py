import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.modules.ai.entities.recommendation import Recommendation
from app.modules.ai.services.recommendation import RecommendationService
from app.modules.market.entities.evaluation import AssetScore
from app.modules.market.entities.market import Asset, AssetFeatures, AssetSnapshot
from app.modules.portfolio.entities.portfolio import Portfolio, Position

# Regression test: generate_recommendations() used to iterate every AssetSnapshot
# in the DB (list_all_snapshots), scoring assets the user has never held —
# e.g. a hardcoded big-tech seed universe would surface HOLD recommendations
# for GOOGL/NVDA/AAPL/MSFT regardless of portfolio contents. Recommendations
# must only ever be generated for assets held in a portfolio position.


def _seed_asset(db_session, symbol: str) -> Asset:
    asset = Asset(id=uuid.uuid4(), symbol=symbol, name=symbol, asset_class="equity")
    db_session.add(asset)
    db_session.flush()

    db_session.add(AssetSnapshot(asset_id=asset.id))
    db_session.flush()

    db_session.add(AssetFeatures(
        asset_id=asset.id,
        momentum_score=0.6,
        volatility_score=0.3,
        sentiment_score=0.6,
    ))
    db_session.add(AssetScore(
        asset_id=asset.id,
        model_version="v1.0.0",
        quality_score=0.6,
        valuation_score=0.6,
        generated_at=datetime.now(timezone.utc),
    ))
    db_session.commit()
    return asset


def test_generate_recommendations_skips_unheld_assets(db_session):
    portfolio = Portfolio(id=uuid.uuid4(), name="Recommendation Scope Test Portfolio")
    db_session.add(portfolio)
    db_session.commit()

    held_asset = _seed_asset(db_session, f"HELD-{uuid.uuid4().hex[:8]}")
    unheld_asset = _seed_asset(db_session, f"UNHELD-{uuid.uuid4().hex[:8]}")

    db_session.add(Position(
        portfolio_id=portfolio.id,
        symbol=held_asset.symbol,
        asset_id=held_asset.id,
        quantity=10,
        avg_buy_price=100,
    ))
    db_session.commit()

    try:
        RecommendationService(db_session).generate_recommendations()

        held_rec = db_session.scalar(select(Recommendation).filter_by(asset_id=held_asset.id))
        unheld_rec = db_session.scalar(select(Recommendation).filter_by(asset_id=unheld_asset.id))

        assert held_rec is not None
        assert unheld_rec is None
    finally:
        db_session.query(Position).filter_by(asset_id=held_asset.id).delete()
        db_session.delete(portfolio)
        db_session.query(Recommendation).filter(
            Recommendation.asset_id.in_([held_asset.id, unheld_asset.id])
        ).delete(synchronize_session=False)
        db_session.query(AssetScore).filter(
            AssetScore.asset_id.in_([held_asset.id, unheld_asset.id])
        ).delete(synchronize_session=False)
        db_session.query(AssetFeatures).filter(
            AssetFeatures.asset_id.in_([held_asset.id, unheld_asset.id])
        ).delete(synchronize_session=False)
        db_session.query(AssetSnapshot).filter(
            AssetSnapshot.asset_id.in_([held_asset.id, unheld_asset.id])
        ).delete(synchronize_session=False)
        db_session.query(Asset).filter(
            Asset.id.in_([held_asset.id, unheld_asset.id])
        ).delete(synchronize_session=False)
        db_session.commit()
