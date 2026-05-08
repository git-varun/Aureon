"""Idempotent schema patcher — runs at every startup.

PATCHES     — re-runnable ALTER TABLE / CREATE INDEX statements (IF NOT EXISTS).
ONE_TIME_MIGRATIONS — tracked in _schema_migrations; each entry runs at most once.
"""

import logging
from typing import Callable, Union

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger("db_patcher")

# ---------------------------------------------------------------------------
# Enum → VARCHAR conversions (must run before column additions that reference
# these columns so we don't hit "column is of type assettype" errors)
# ---------------------------------------------------------------------------
ENUM_CONVERSIONS = [
    "ALTER TABLE assets ALTER COLUMN asset_type TYPE VARCHAR(30) USING asset_type::text",
    "ALTER TABLE transactions ALTER COLUMN transaction_type TYPE VARCHAR(30) USING transaction_type::text",
    "DROP TYPE IF EXISTS assettype",
    "DROP TYPE IF EXISTS transactiontype",
]

# ---------------------------------------------------------------------------
# Idempotent column / index additions — safe to re-run every boot
# ---------------------------------------------------------------------------
PATCHES = [
    # assets
    "ALTER TABLE assets ADD COLUMN IF NOT EXISTS price_source VARCHAR(20) DEFAULT 'market'",
    "ALTER TABLE assets ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'INR'",
    "ALTER TABLE assets ADD COLUMN IF NOT EXISTS is_tradeable BOOLEAN DEFAULT TRUE",
    "ALTER TABLE assets ADD COLUMN IF NOT EXISTS annual_yield FLOAT",
    "ALTER TABLE assets ADD COLUMN IF NOT EXISTS maturity_date DATE",
    "ALTER TABLE assets ADD COLUMN IF NOT EXISTS asset_metadata JSONB DEFAULT '{}'::jsonb",
    "ALTER TABLE assets ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE",
    "ALTER TABLE assets ADD COLUMN IF NOT EXISTS tier VARCHAR(20)",
    "CREATE INDEX IF NOT EXISTS idx_asset_tier ON assets(tier)",
    "CREATE INDEX IF NOT EXISTS idx_asset_metadata_gin ON assets USING gin(asset_metadata)",
    # positions
    "ALTER TABLE positions ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)",
    "ALTER TABLE positions ADD COLUMN IF NOT EXISTS valuation_method VARCHAR(20) DEFAULT 'market'",
    "ALTER TABLE positions ADD COLUMN IF NOT EXISTS last_valued_at TIMESTAMPTZ",
    "ALTER TABLE positions ADD COLUMN IF NOT EXISTS notes TEXT",
    # transactions
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)",
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fees FLOAT DEFAULT 0.0",
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS taxes FLOAT DEFAULT 0.0",
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS notes TEXT",
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS broker_reference VARCHAR(100)",
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS kind VARCHAR(30) DEFAULT 'trade'",
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recommendation_id INTEGER REFERENCES recommendations(id)",
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS predicted_impact VARCHAR(80)",
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS realized_impact VARCHAR(80)",
    "CREATE INDEX IF NOT EXISTS idx_transaction_kind ON transactions(kind)",
    "CREATE INDEX IF NOT EXISTS idx_transaction_rec ON transactions(recommendation_id)",
    # provider_configs — add config column for non-credential settings (e.g. signal_eligibility)
    "ALTER TABLE provider_configs ADD COLUMN IF NOT EXISTS config TEXT DEFAULT '{}'",
    # signals
    "ALTER TABLE signals ADD COLUMN IF NOT EXISTS asset_id INTEGER REFERENCES assets(id)",
    "ALTER TABLE signals ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'",
    "ALTER TABLE signals ADD COLUMN IF NOT EXISTS trigger_price FLOAT",
    "ALTER TABLE signals ADD COLUMN IF NOT EXISTS stop_loss FLOAT",
    "ALTER TABLE signals ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ",
    "ALTER TABLE signals ADD COLUMN IF NOT EXISTS signal_metadata JSONB DEFAULT '{}'::jsonb",
    "CREATE INDEX IF NOT EXISTS idx_signal_asset_id ON signals(asset_id)",
    "CREATE INDEX IF NOT EXISTS idx_signal_status ON signals(status, expires_at)",
]


# ---------------------------------------------------------------------------
# One-time data migrations — recorded in _schema_migrations after success
# ---------------------------------------------------------------------------
def _backfill_news_assets(session) -> None:
    """Populate news_assets junction from legacy news.symbols strings."""
    from app.modules.news.services import parse_symbols_field
    from sqlalchemy import text as _text

    rows = session.execute(
        _text("SELECT id, symbols FROM news WHERE symbols IS NOT NULL AND symbols != ''")
    ).fetchall()
    asset_map = dict(
        session.execute(_text("SELECT UPPER(symbol), id FROM assets")).fetchall()
    )
    for news_id, symbols_str in rows:
        for sym in parse_symbols_field(symbols_str):
            asset_id = asset_map.get(sym)
            if asset_id:
                session.execute(
                    _text(
                        "INSERT INTO news_assets (news_id, asset_id) VALUES (:n, :a)"
                        " ON CONFLICT DO NOTHING"
                    ),
                    {"n": news_id, "a": asset_id},
                )


ONE_TIME_MIGRATIONS: list[tuple[str, Union[str, Callable]]] = [
    (
        "backfill_signal_asset_id",
        "UPDATE signals s SET asset_id = a.id FROM assets a WHERE a.symbol = s.symbol AND s.asset_id IS NULL",
    ),
    (
        "backfill_positions_user_id",
        "UPDATE positions SET user_id = (SELECT id FROM users ORDER BY id LIMIT 1) WHERE user_id IS NULL",
    ),
    (
        "backfill_transactions_user_id",
        "UPDATE transactions SET user_id = (SELECT id FROM users ORDER BY id LIMIT 1) WHERE user_id IS NULL",
    ),
    ("backfill_news_assets", _backfill_news_assets),
    (
        "backfill_transactions_kind",
        "UPDATE transactions SET kind = 'trade' WHERE kind IS NULL",
    ),
    (
        "backfill_assets_tier",
        """
            UPDATE assets
            SET tier = CASE
                           WHEN asset_type IN ('equity', 'crypto') THEN 'active'
                           WHEN asset_type IN ('mutual_fund', 'bond') THEN 'semi'
                           WHEN asset_type IN ('epf', 'ppf', 'insurance', 'real_estate', 'commodity') THEN 'passive'
                           ELSE 'passive'
                END
            WHERE tier IS NULL
        """,
    ),
]

_BOOTSTRAP_SQL = """
                     CREATE TABLE IF NOT EXISTS _schema_migrations
                     (
                         name
                         VARCHAR
                     (
                         128
                     ) PRIMARY KEY,
                         applied_at TIMESTAMPTZ NOT NULL DEFAULT now
                     (
                     )
                         ) \
                 """


def run_patches(engine: Engine) -> None:
    """Entry point called from app lifespan after create_all()."""
    with engine.connect() as conn:
        # Bootstrap tracking table
        conn.execute(text(_BOOTSTRAP_SQL))
        conn.commit()

        # Enum conversions — each wrapped in its own try/except so a "does not
        # exist" error on the DROP TYPE doesn't abort the whole run.
        for sql in ENUM_CONVERSIONS:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception as exc:
                conn.rollback()
                logger.debug("ENUM_CONVERSION skipped (likely already done): %s — %s", sql[:60], exc)

        # Idempotent patches
        for sql in PATCHES:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception as exc:
                conn.rollback()
                logger.warning("PATCH failed: %s — %s", sql[:80], exc)

        # One-time migrations
        applied = {
            row[0]
            for row in conn.execute(text("SELECT name FROM _schema_migrations")).fetchall()
        }
        for name, migration in ONE_TIME_MIGRATIONS:
            if name in applied:
                continue
            try:
                if callable(migration):
                    from app.core.db import SessionLocal
                    with SessionLocal() as session:
                        migration(session)
                        session.commit()
                else:
                    conn.execute(text(migration))
                    conn.commit()
                conn.execute(text("INSERT INTO _schema_migrations (name) VALUES (:n)"), {"n": name})
                conn.commit()
                logger.info("ONE_TIME_MIGRATION applied: %s", name)
            except Exception as exc:
                conn.rollback()
                logger.error("ONE_TIME_MIGRATION failed: %s — %s", name, exc)
