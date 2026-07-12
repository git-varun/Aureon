"""drop dead job_runs table

Revision ID: ad9c01814823
Revises: 34ff314650a4
Create Date: 2026-07-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ad9c01814823'
down_revision: Union[str, None] = '34ff314650a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table('job_runs', schema='system')


def downgrade() -> None:
    op.create_table(
        'job_runs',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('job_name', sa.String(), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=False),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('rows_processed', sa.Integer(), nullable=False),
        sa.Column('error', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        schema='system'
    )
    op.create_index('idx_job_runs_started_at_desc', 'job_runs', [sa.text('started_at DESC')], schema='system')
    op.create_index('idx_job_runs_status', 'job_runs', ['status'], schema='system')
