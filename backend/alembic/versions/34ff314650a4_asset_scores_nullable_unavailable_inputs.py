"""asset_scores nullable score columns + unavailable_inputs

Revision ID: 34ff314650a4
Revises: a01d61e3e204
Create Date: 2026-07-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '34ff314650a4'
down_revision: Union[str, None] = 'a01d61e3e204'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('asset_scores', 'recommendation_score', nullable=True, schema='evaluation')
    op.alter_column('asset_scores', 'quality_score', nullable=True, schema='evaluation')
    op.alter_column('asset_scores', 'valuation_score', nullable=True, schema='evaluation')
    op.add_column(
        'asset_scores',
        sa.Column('unavailable_inputs', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='[]'),
        schema='evaluation'
    )
    op.alter_column('asset_scores', 'unavailable_inputs', server_default=None, schema='evaluation')


def downgrade() -> None:
    op.drop_column('asset_scores', 'unavailable_inputs', schema='evaluation')
    op.alter_column('asset_scores', 'valuation_score', nullable=False, schema='evaluation')
    op.alter_column('asset_scores', 'quality_score', nullable=False, schema='evaluation')
    op.alter_column('asset_scores', 'recommendation_score', nullable=False, schema='evaluation')
