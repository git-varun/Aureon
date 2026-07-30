"""add import_runs table

Revision ID: b3f7a1c9d4e2
Revises: 7e8a272774af
Create Date: 2026-07-27 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3f7a1c9d4e2'
down_revision: Union[str, None] = '7e8a272774af'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('import_runs',
    sa.Column('portfolio_id', sa.Uuid(), nullable=False),
    sa.Column('source', sa.String(), nullable=False),
    sa.Column('filename', sa.String(), nullable=False),
    sa.Column('status', sa.String(), nullable=False),
    sa.Column('rows_committed', sa.Integer(), nullable=False),
    sa.Column('rows_skipped', sa.Integer(), nullable=False),
    sa.Column('error_summary', sa.Text(), nullable=True),
    sa.Column('started_at', sa.DateTime(), nullable=False),
    sa.Column('duration_ms', sa.Integer(), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['portfolio_id'], ['portfolio.portfolios.id'], name=op.f('fk_import_runs_portfolio_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_import_runs')),
    schema='portfolio'
    )
    op.create_index(op.f('ix_portfolio_import_runs_portfolio_id'), 'import_runs', ['portfolio_id'], unique=False, schema='portfolio')


def downgrade() -> None:
    op.drop_index(op.f('ix_portfolio_import_runs_portfolio_id'), table_name='import_runs', schema='portfolio')
    op.drop_table('import_runs', schema='portfolio')
