"""accrual_ledger: add user_id for per-user corpus isolation

Revision ID: 7bd2a8d5def0
Revises: c3d4e5f6a7b8
Create Date: 2026-05-27

Changes:
- Add nullable user_id FK on accrual_ledger so that multiple users holding
  the same global EPF/EPS asset maintain independent corpus ledgers.
  Existing rows are left with user_id = NULL (treated as legacy/unscoped).
"""
from alembic import op
import sqlalchemy as sa


revision = "7bd2a8d5def0"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "accrual_ledger",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
    )
    op.create_index("idx_accrual_user_asset_period", "accrual_ledger", ["user_id", "asset_id", "period_start"])


def downgrade() -> None:
    op.drop_index("idx_accrual_user_asset_period", table_name="accrual_ledger")
    op.drop_column("accrual_ledger", "user_id")
