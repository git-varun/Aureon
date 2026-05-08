"""Tests for the _backfill_news_assets one-time migration.

Runs against a real DB — skipped when PostgreSQL is unavailable.
"""

import pytest
from sqlalchemy import create_engine, text

from app.core.config import settings


@pytest.fixture(scope="module")
def pg_engine():
    try:
        engine = create_engine(settings.database_url, pool_pre_ping=True)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        # Ensure all tables exist
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


def test_backfill_news_assets_inserts_correct_pairs(pg_engine):
    from app.core.db_patcher import _backfill_news_assets
    from app.core.db import SessionLocal

    with pg_engine.connect() as conn:
        # Seed a test asset
        conn.execute(text(
            "INSERT INTO assets (symbol, name, asset_type) VALUES ('BKFLTEST', 'Backfill Test', 'equity')"
            " ON CONFLICT (symbol) DO NOTHING"
        ))
        conn.commit()
        asset_id = conn.execute(
            text("SELECT id FROM assets WHERE symbol = 'BKFLTEST'")
        ).scalar()

        # Seed a news row with the symbol (mixed case to test case-insensitive matching)
        conn.execute(text(
            "INSERT INTO news (title, source, symbols) VALUES ('Test headline', 'test', 'bkfltest')"
        ))
        conn.commit()
        news_id = conn.execute(
            text("SELECT id FROM news WHERE title = 'Test headline' ORDER BY id DESC LIMIT 1")
        ).scalar()

    with SessionLocal() as session:
        _backfill_news_assets(session)
        session.commit()

    with pg_engine.connect() as conn:
        count = conn.execute(
            text("SELECT COUNT(*) FROM news_assets WHERE news_id = :n AND asset_id = :a"),
            {"n": news_id, "a": asset_id},
        ).scalar()
        # Cleanup
        conn.execute(text("DELETE FROM news_assets WHERE news_id = :n"), {"n": news_id})
        conn.execute(text("DELETE FROM news WHERE id = :n"), {"n": news_id})
        conn.execute(text("DELETE FROM assets WHERE id = :a"), {"a": asset_id})
        conn.commit()

    assert count == 1


def test_backfill_news_assets_is_idempotent(pg_engine):
    """Running backfill twice must not create duplicate rows."""
    from app.core.db_patcher import _backfill_news_assets
    from app.core.db import SessionLocal

    with pg_engine.connect() as conn:
        conn.execute(text(
            "INSERT INTO assets (symbol, name, asset_type) VALUES ('IDEMTEST', 'Idem Test', 'equity')"
            " ON CONFLICT (symbol) DO NOTHING"
        ))
        conn.commit()
        asset_id = conn.execute(
            text("SELECT id FROM assets WHERE symbol = 'IDEMTEST'")
        ).scalar()
        conn.execute(text(
            "INSERT INTO news (title, source, symbols) VALUES ('Idem headline', 'test', 'IDEMTEST')"
        ))
        conn.commit()
        news_id = conn.execute(
            text("SELECT id FROM news WHERE title = 'Idem headline' ORDER BY id DESC LIMIT 1")
        ).scalar()

    with SessionLocal() as session:
        _backfill_news_assets(session)
        session.commit()
    with SessionLocal() as session:
        _backfill_news_assets(session)
        session.commit()

    with pg_engine.connect() as conn:
        count = conn.execute(
            text("SELECT COUNT(*) FROM news_assets WHERE news_id = :n AND asset_id = :a"),
            {"n": news_id, "a": asset_id},
        ).scalar()
        conn.execute(text("DELETE FROM news_assets WHERE news_id = :n"), {"n": news_id})
        conn.execute(text("DELETE FROM news WHERE id = :n"), {"n": news_id})
        conn.execute(text("DELETE FROM assets WHERE id = :a"), {"a": asset_id})
        conn.commit()

    assert count == 1
