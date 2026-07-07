"""add tier to assets

Revision ID: 8a09da24d2aa
Revises: f5dc9f64c088
Create Date: 2026-07-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '8a09da24d2aa'
down_revision: Union[str, None] = 'f5dc9f64c088'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('assets', sa.Column('tier', sa.Integer(), nullable=True), schema='market')


def downgrade() -> None:
    op.drop_column('assets', 'tier', schema='market')
