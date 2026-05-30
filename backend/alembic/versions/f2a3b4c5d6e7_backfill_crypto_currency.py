"""backfill currency=USD for existing crypto assets

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-05-28

"""
from alembic import op

revision = 'f2a3b4c5d6e7'
down_revision = 'e1f2a3b4c5d6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE assets SET currency = 'USD' WHERE asset_type = 'crypto'")


def downgrade() -> None:
    op.execute("UPDATE assets SET currency = 'INR' WHERE asset_type = 'crypto'")
