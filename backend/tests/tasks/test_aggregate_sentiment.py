"""Tests for aggregate_sentiment_task.

Uses a real PostgreSQL connection — skipped when unavailable.
"""

import pytest
from datetime import datetime, timedelta, timezone
from sqlalchemy import create_engine, text

from app.core.config import settings


@pytest.fixture(scope="module")
def pg_engine():
    try:
        engine = create_engine(settings.database_url, pool_pre_ping=True)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        from app.core.db import Base
        import app.modules.analytics.models  # noqa: F401
        import app.modules.news.models  # noqa: F401
        import app.modules.portfolio.models  # noqa: F401
        import app.modules.users.models  # noqa: F401
        Base.metadata.create_all(bind=engine)
        yield engine
        engine.dispose()
    except Exception:
        pytest.skip("PostgreSQL unavailable")


def _seed(session, asset_symbol, articles):
    """Insert test asset + news rows + junction rows. Returns (asset_id, [news_ids])."""
    from app.modules.portfolio.models import Asset
    from app.modules.news.models import News, NewsAsset

    asset = session.query(Asset).filter_by(symbol=asset_symbol).first()
    if not asset:
        asset = Asset(symbol=asset_symbol, name=f"Sentiment Test {asset_symbol}", asset_type="equity")
        session.add(asset)
        session.flush()

    news_ids = []
    for title, score, days_ago in articles:
        pub = datetime.now(timezone.utc) - timedelta(days=days_ago)
        n = News(title=title, source="test", symbols=asset_symbol,
                 sentiment_score=score, published_at=pub)
        session.add(n)
        session.flush()
        session.add(NewsAsset(news_id=n.id, asset_id=asset.id))
        news_ids.append(n.id)

    session.commit()
    return asset.id, news_ids


def _cleanup(session, asset_symbol, news_ids):
    from app.modules.news.models import News, NewsAsset, AssetSentimentSnapshot
    from app.modules.portfolio.models import Asset

    session.query(NewsAsset).filter(NewsAsset.news_id.in_(news_ids)).delete(synchronize_session=False)
    session.query(News).filter(News.id.in_(news_ids)).delete(synchronize_session=False)
    asset = session.query(Asset).filter_by(symbol=asset_symbol).first()
    if asset:
        session.query(AssetSentimentSnapshot).filter_by(asset_id=asset.id).delete()
        session.delete(asset)
    session.commit()


def test_aggregate_sentiment_computes_averages(pg_engine):
    """Task must write correct 7d/30d averages for seeded news."""
    from app.core.db import SessionLocal
    from app.modules.news.models import AssetSentimentSnapshot
    from app.tasks.news import aggregate_sentiment_task

    articles = [
        ("Recent positive", 0.8, 1),  # within 7d
        ("Recent neutral", 0.2, 3),  # within 7d
        ("Old positive", 0.6, 20),  # within 30d only
    ]

    with SessionLocal() as session:
        asset_id, news_ids = _seed(session, "SENTTEST1", articles)

    aggregate_sentiment_task()

    with SessionLocal() as session:
        snapshot = (
            session.query(AssetSentimentSnapshot)
            .filter_by(asset_id=asset_id)
            .order_by(AssetSentimentSnapshot.snapshot_date.desc())
            .first()
        )
        assert snapshot is not None
        assert snapshot.avg_sentiment_7d == pytest.approx(0.5, abs=0.01)  # (0.8+0.2)/2
        assert snapshot.avg_sentiment_30d == pytest.approx(0.533, abs=0.01)  # (0.8+0.2+0.6)/3
        assert snapshot.article_count_7d == 2
        _cleanup(session, "SENTTEST1", news_ids)


def test_aggregate_sentiment_trend_improving(pg_engine):
    """7d avg significantly above 30d avg → IMPROVING trend."""
    from app.core.db import SessionLocal
    from app.modules.news.models import AssetSentimentSnapshot
    from app.tasks.news import aggregate_sentiment_task

    articles = [
        ("Recent very positive", 0.9, 1),
        ("Recent positive", 0.8, 3),
        ("Old negative", -0.5, 20),
        ("Old negative", -0.4, 25),
    ]

    with SessionLocal() as session:
        asset_id, news_ids = _seed(session, "SENTTEST2", articles)

    aggregate_sentiment_task()

    with SessionLocal() as session:
        snapshot = (
            session.query(AssetSentimentSnapshot)
            .filter_by(asset_id=asset_id)
            .order_by(AssetSentimentSnapshot.snapshot_date.desc())
            .first()
        )
        assert snapshot is not None
        assert snapshot.trend == "IMPROVING"
        _cleanup(session, "SENTTEST2", news_ids)


def test_aggregate_sentiment_trend_deteriorating(pg_engine):
    """7d avg significantly below 30d avg → DETERIORATING trend."""
    from app.core.db import SessionLocal
    from app.modules.news.models import AssetSentimentSnapshot
    from app.tasks.news import aggregate_sentiment_task

    articles = [
        ("Recent negative", -0.8, 1),
        ("Recent negative", -0.7, 3),
        ("Old positive", 0.6, 20),
        ("Old positive", 0.5, 25),
    ]

    with SessionLocal() as session:
        asset_id, news_ids = _seed(session, "SENTTEST3", articles)

    aggregate_sentiment_task()

    with SessionLocal() as session:
        snapshot = (
            session.query(AssetSentimentSnapshot)
            .filter_by(asset_id=asset_id)
            .order_by(AssetSentimentSnapshot.snapshot_date.desc())
            .first()
        )
        assert snapshot is not None
        assert snapshot.trend == "DETERIORATING"
        _cleanup(session, "SENTTEST3", news_ids)
