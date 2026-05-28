"""add user extended profile fields

Revision ID: 8f596576e4a6
Revises: 0001_baseline_and_auth_methods
Create Date: 2026-05-21 16:20:53.873047

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '8f596576e4a6'
down_revision: Union[str, None] = '0001_baseline_and_auth_methods'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS risk_profile VARCHAR")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS working_area VARCHAR")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS target_profit_pct FLOAT")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_saving FLOAT")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS swing_trading_enabled BOOLEAN")


def downgrade() -> None:
    op.drop_column('users', 'swing_trading_enabled')
    op.drop_column('users', 'monthly_saving')
    op.drop_column('users', 'target_profit_pct')
    op.drop_column('users', 'working_area')
    op.drop_column('users', 'risk_profile')
