"""Absorb db_patcher — enum conversions, column/index additions, one-time data migrations.

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-24
"""

from alembic import op
from sqlalchemy import text

revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _do(sql: str) -> str:
    """Wrap arbitrary DDL in a PL/pgSQL DO block so errors are caught and skipped."""
    return f"DO $$ BEGIN {sql}; EXCEPTION WHEN others THEN NULL; END $$"


def _run(conn, sql: str) -> None:
    conn.execute(text(sql))


# ---------------------------------------------------------------------------
# upgrade
# ---------------------------------------------------------------------------

def upgrade() -> None:
    conn = op.get_bind()

    # ── 0. Bootstrap migration-tracking table (must be first to avoid poisoning) ──
    _run(conn, """
        CREATE TABLE IF NOT EXISTS _schema_migrations (
            name       VARCHAR(128) PRIMARY KEY,
            applied_at TIMESTAMPTZ  NOT NULL DEFAULT now()
        )
    """)

    # ── 1. Enum → VARCHAR conversions ────────────────────────────────────────
    # Each wrapped in a DO block: fails silently when already converted.
    enum_conversions = [
        "ALTER TABLE assets ALTER COLUMN asset_type TYPE VARCHAR(30) USING asset_type::text",
        "ALTER TABLE transactions ALTER COLUMN transaction_type TYPE VARCHAR(30) USING transaction_type::text",
        "DROP TYPE IF EXISTS assettype",
        "DROP TYPE IF EXISTS transactiontype",
        "ALTER TABLE assets ALTER COLUMN asset_metadata TYPE JSONB USING asset_metadata::jsonb",
    ]
    for sql in enum_conversions:
        _run(conn, _do(sql))

    # ── 2. Idempotent column / index additions ────────────────────────────────
    # All use IF NOT EXISTS — safe to re-run. The one ALTER without a guard is
    # wrapped in a DO block.
    patches = [
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
        # signals — user ownership
        "ALTER TABLE signals ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)",
        "CREATE INDEX IF NOT EXISTS idx_signal_user ON signals(user_id)",
        # recommendations — user ownership
        "ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)",
        "CREATE INDEX IF NOT EXISTS idx_rec_user ON recommendations(user_id)",
        # provider_configs
        "ALTER TABLE provider_configs ADD COLUMN IF NOT EXISTS config TEXT DEFAULT '{}'",
        # signals — extra columns
        "ALTER TABLE signals ADD COLUMN IF NOT EXISTS asset_id INTEGER REFERENCES assets(id)",
        "ALTER TABLE signals ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'",
        "ALTER TABLE signals ADD COLUMN IF NOT EXISTS trigger_price FLOAT",
        "ALTER TABLE signals ADD COLUMN IF NOT EXISTS stop_loss FLOAT",
        "ALTER TABLE signals ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ",
        "ALTER TABLE signals ADD COLUMN IF NOT EXISTS signal_metadata JSONB DEFAULT '{}'::jsonb",
        "CREATE INDEX IF NOT EXISTS idx_signal_asset_id ON signals(asset_id)",
        "CREATE INDEX IF NOT EXISTS idx_signal_status ON signals(status, expires_at)",
        # job_configs
        "ALTER TABLE job_configs ADD COLUMN IF NOT EXISTS job_tier VARCHAR(16) DEFAULT 'user'",
    ]
    for sql in patches:
        _run(conn, sql)

    # job_logs.task_id: widen to VARCHAR(512) — no IF NOT EXISTS guard on ALTER TYPE,
    # so we use a DO block to skip silently when already widened.
    _run(conn, _do("ALTER TABLE job_logs ALTER COLUMN task_id TYPE VARCHAR(512)"))

    # ── 3. One-time data migrations ───────────────────────────────────────────
    # Each entry is (name, sql_string).  Callable migrations are inlined as SQL
    # so the revision has no runtime import dependencies.
    one_time: list[tuple[str, str]] = [
        (
            "backfill_signal_asset_id",
            "UPDATE signals s SET asset_id = a.id FROM assets a"
            " WHERE a.symbol = s.symbol AND s.asset_id IS NULL",
        ),
        (
            "backfill_positions_user_id",
            "UPDATE positions SET user_id = (SELECT id FROM users ORDER BY id LIMIT 1)"
            " WHERE user_id IS NULL",
        ),
        (
            "backfill_transactions_user_id",
            "UPDATE transactions SET user_id = (SELECT id FROM users ORDER BY id LIMIT 1)"
            " WHERE user_id IS NULL",
        ),
        (
            "backfill_signals_user_id",
            "UPDATE signals SET user_id = (SELECT id FROM users ORDER BY id LIMIT 1)"
            " WHERE user_id IS NULL",
        ),
        (
            "backfill_recommendations_user_id",
            "UPDATE recommendations SET user_id = (SELECT id FROM users ORDER BY id LIMIT 1)"
            " WHERE user_id IS NULL",
        ),
        (
            "enforce_positions_user_id_notnull",
            "ALTER TABLE positions ALTER COLUMN user_id SET NOT NULL",
        ),
        (
            "enforce_transactions_user_id_notnull",
            "ALTER TABLE transactions ALTER COLUMN user_id SET NOT NULL",
        ),
        (
            "backfill_news_assets",
            """
            INSERT INTO news_assets (news_id, asset_id)
            SELECT n.id, a.id
            FROM   news n
            JOIN   unnest(string_to_array(n.symbols, ',')) AS sym ON TRUE
            JOIN   assets a ON UPPER(TRIM(sym)) = UPPER(a.symbol)
            WHERE  n.symbols IS NOT NULL AND n.symbols != ''
            ON CONFLICT DO NOTHING
            """,
        ),
        (
            "backfill_transactions_kind",
            "UPDATE transactions SET kind = 'trade' WHERE kind IS NULL",
        ),
        (
            "set_system_job_tiers",
            """
            UPDATE job_configs
            SET    job_tier = 'system'
            WHERE  job_name IN (
                'aggregate_sentiment', 'seed_fundamentals', 'fetch_fx_rate',
                'compute_state', 'accrue_epf', 'bond_mtm', 'insurance_premium'
            )
            """,
        ),
        (
            "backfill_assets_tier",
            """
            UPDATE assets
            SET tier = CASE
                WHEN asset_type IN ('equity', 'crypto')                              THEN 'active'
                WHEN asset_type IN ('mutual_fund', 'bond')                           THEN 'semi'
                WHEN asset_type IN ('epf', 'ppf', 'insurance', 'real_estate', 'commodity') THEN 'passive'
                ELSE 'passive'
            END
            WHERE tier IS NULL
            """,
        ),
    ]

    applied = {
        row[0]
        for row in conn.execute(text("SELECT name FROM _schema_migrations")).fetchall()
    }
    for name, sql in one_time:
        if name in applied:
            continue
        _run(conn, sql)
        conn.execute(text("INSERT INTO _schema_migrations (name) VALUES (:n)"), {"n": name})


def downgrade() -> None:
    # This revision is a schema-hardening pass; individual column removals are
    # destructive and not worth the maintenance cost.  A full rollback requires
    # restoring from backup.
    pass
