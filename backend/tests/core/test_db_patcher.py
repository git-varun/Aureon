"""Tests for db_patcher — idempotency and column presence.

Uses a real PostgreSQL connection (DATABASE_URL from environment).
Skipped automatically when the DB is unavailable.
"""

import pytest
from sqlalchemy import create_engine, text, inspect

from app.core.config import settings


@pytest.fixture(scope="module")
def pg_engine():
    """Return a live engine or skip the test."""
    try:
        engine = create_engine(settings.database_url, pool_pre_ping=True)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        yield engine
        engine.dispose()
    except Exception:
        pytest.skip("PostgreSQL unavailable")


def _column_names(engine, table: str) -> set[str]:
    insp = inspect(engine)
    return {col["name"] for col in insp.get_columns(table)}


def _index_names(engine, table: str) -> set[str]:
    insp = inspect(engine)
    return {idx["name"] for idx in insp.get_indexes(table)}


class TestDbPatcher:
    def test_patches_run_without_error(self, pg_engine):
        """run_patches() must not raise on a live database."""
        from app.core.db_patcher import run_patches
        run_patches(pg_engine)

    def test_patches_are_idempotent(self, pg_engine):
        """Running patches twice must not raise."""
        from app.core.db_patcher import run_patches
        run_patches(pg_engine)
        run_patches(pg_engine)

    def test_assets_new_columns_exist(self, pg_engine):
        from app.core.db_patcher import run_patches
        run_patches(pg_engine)
        cols = _column_names(pg_engine, "assets")
        for col in ("price_source", "currency", "is_tradeable", "annual_yield",
                    "maturity_date", "asset_metadata", "is_active"):
            assert col in cols, f"Missing column: assets.{col}"

    def test_positions_new_columns_exist(self, pg_engine):
        from app.core.db_patcher import run_patches
        run_patches(pg_engine)
        cols = _column_names(pg_engine, "positions")
        for col in ("user_id", "valuation_method", "last_valued_at", "notes"):
            assert col in cols, f"Missing column: positions.{col}"

    def test_transactions_new_columns_exist(self, pg_engine):
        from app.core.db_patcher import run_patches
        run_patches(pg_engine)
        cols = _column_names(pg_engine, "transactions")
        for col in ("user_id", "fees", "taxes", "notes", "broker_reference"):
            assert col in cols, f"Missing column: transactions.{col}"

    def test_signals_new_columns_exist(self, pg_engine):
        from app.core.db_patcher import run_patches
        run_patches(pg_engine)
        cols = _column_names(pg_engine, "signals")
        for col in ("asset_id", "status", "trigger_price", "stop_loss", "expires_at", "signal_metadata"):
            assert col in cols, f"Missing column: signals.{col}"

    def test_gin_index_created(self, pg_engine):
        from app.core.db_patcher import run_patches
        run_patches(pg_engine)
        indexes = _index_names(pg_engine, "assets")
        assert "idx_asset_metadata_gin" in indexes

    def test_schema_migrations_table_exists(self, pg_engine):
        from app.core.db_patcher import run_patches
        run_patches(pg_engine)
        with pg_engine.connect() as conn:
            result = conn.execute(text("SELECT COUNT(*) FROM _schema_migrations")).scalar()
        assert result >= 0

    def test_one_time_migrations_not_duplicated(self, pg_engine):
        from app.core.db_patcher import run_patches
        run_patches(pg_engine)
        run_patches(pg_engine)
        with pg_engine.connect() as conn:
            rows = conn.execute(
                text("SELECT name, COUNT(*) FROM _schema_migrations GROUP BY name HAVING COUNT(*) > 1")
            ).fetchall()
        assert rows == [], f"Duplicate migration entries: {rows}"

    def test_phase2_new_tables_exist(self, pg_engine):
        """All Phase 2 tables must be present after create_all + run_patches."""
        from app.core.db import Base
        from app.core.db_patcher import run_patches
        import app.modules.analytics.models  # noqa: F401
        import app.modules.news.models  # noqa: F401
        import app.modules.portfolio.models  # noqa: F401
        Base.metadata.create_all(bind=pg_engine)
        run_patches(pg_engine)
        insp = inspect(pg_engine)
        existing = set(insp.get_table_names())
        for table in (
                "ai_recommendations",
                "portfolio_optimizations",
                "news_assets",
                "asset_sentiment_snapshots",
                "asset_valuations",
                "accrual_ledger",
        ):
            assert table in existing, f"Table missing: {table}"
