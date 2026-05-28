"""add_theme_weights_and_fork_columns

Revision ID: d5e6f7a8b9c0
Revises: 7bd2a8d5def0
Create Date: 2026-05-28

"""
from alembic import op
import sqlalchemy as sa
from datetime import date

revision = "d5e6f7a8b9c0"
down_revision = "7bd2a8d5def0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new columns to market_themes
    op.add_column("market_themes", sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True))
    op.add_column("market_themes", sa.Column("forked_from", sa.String(40), nullable=True))
    op.add_column("market_themes", sa.Column("inception_date", sa.Date(), nullable=True))
    op.add_column("market_themes", sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.false()))

    op.create_index("ix_market_themes_owner_id", "market_themes", ["owner_id"])

    # Backfill inception_date for existing system themes
    op.execute(f"UPDATE market_themes SET inception_date = '{date.today().isoformat()}' WHERE inception_date IS NULL")

    # Create theme_weights table
    op.create_table(
        "theme_weights",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("theme_id", sa.String(40), nullable=False, index=True),
        sa.Column("symbol", sa.String(40), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False),
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column("mcap_at_set", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("theme_id", "symbol", "effective_date", name="uq_theme_weight_snapshot"),
    )
    op.create_index("idx_theme_weight_theme_date", "theme_weights", ["theme_id", "effective_date"])


def downgrade() -> None:
    op.drop_index("idx_theme_weight_theme_date", table_name="theme_weights")
    op.drop_table("theme_weights")
    op.drop_index("ix_market_themes_owner_id", table_name="market_themes")
    op.drop_column("market_themes", "is_public")
    op.drop_column("market_themes", "inception_date")
    op.drop_column("market_themes", "forked_from")
    op.drop_column("market_themes", "owner_id")
