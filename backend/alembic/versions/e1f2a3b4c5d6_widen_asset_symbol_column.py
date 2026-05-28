"""widen asset symbol column from 60 to 120 chars for long MF fund names

Revision ID: e1f2a3b4c5d6
Revises: d5e6f7a8b9c0
Create Date: 2026-05-28

"""
from alembic import op
import sqlalchemy as sa

revision = 'e1f2a3b4c5d6'
down_revision = 'd5e6f7a8b9c0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('assets', 'symbol',
                    existing_type=sa.String(60),
                    type_=sa.String(120),
                    existing_nullable=False)


def downgrade() -> None:
    op.alter_column('assets', 'symbol',
                    existing_type=sa.String(120),
                    type_=sa.String(60),
                    existing_nullable=False)
