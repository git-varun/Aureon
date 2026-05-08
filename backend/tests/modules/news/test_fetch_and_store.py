"""Tests for fetch_and_store dual-write: symbols string + news_assets junction.

Uses a real PostgreSQL connection — skipped when unavailable.
"""

import pytest
from unittest.mock import MagicMock, patch
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


def test_fetch_and_store_dual_write(pg_engine):
    """After fetch_and_store, both symbols string and news_assets row must exist."""
    from app.core.db import SessionLocal
    from app.modules.news.services import NewsService
    from app.modules.news.models import News, NewsAsset
    from app.modules.portfolio.models import Asset

    with SessionLocal() as session:
        # Seed asset
        asset = session.query(Asset).filter_by(symbol="DUALTEST").first()
        if not asset:
            asset = Asset(symbol="DUALTEST", name="Dual Write Test", asset_type="equity")
            session.add(asset)
            session.commit()
            session.refresh(asset)

        # Mock provider to return one article
        mock_payload = MagicMock()
        mock_payload.link = "https://example.com/dualtest-article-unique"
        mock_payload.title = "Dual Write Test Headline"
        mock_payload.snippet = "snippet"
        mock_payload.provider = "test"

        mock_provider = MagicMock()
        mock_provider.provider_name = "test"
        mock_provider.fetch_headlines.return_value = [mock_payload]

        mock_registry = MagicMock()
        mock_registry.get_providers.return_value = [mock_provider]
        mock_registry.list_enabled.return_value = ["test"]

        with patch("app.modules.news.services.get_registry", return_value=mock_registry):
            service = NewsService(session)
            count = service.fetch_and_store("DUALTEST", session)

        assert count >= 0  # may be 0 if article already exists from prior run

        # Both columns populated: symbols string preserved, junction row exists
        news_row = session.query(News).filter_by(url="https://example.com/dualtest-article-unique").first()
        assert news_row is not None
        assert "DUALTEST" in (news_row.symbols or "").upper()

        junction = session.query(NewsAsset).filter_by(news_id=news_row.id, asset_id=asset.id).first()
        assert junction is not None, "news_assets junction row missing after fetch_and_store"

        # Cleanup
        session.delete(junction)
        session.delete(news_row)
        session.query(Asset).filter_by(symbol="DUALTEST").delete()
        session.commit()
