"""add import_run_id to transactions

Revision ID: c8d2e5a1f6b3
Revises: b3f7a1c9d4e2
Create Date: 2026-07-27 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c8d2e5a1f6b3'
down_revision: Union[str, None] = 'b3f7a1c9d4e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'transactions',
        sa.Column('import_run_id', sa.Uuid(), nullable=True),
        schema='portfolio',
    )
    op.create_index(
        op.f('ix_portfolio_transactions_import_run_id'), 'transactions', ['import_run_id'],
        unique=False, schema='portfolio',
    )
    op.create_foreign_key(
        op.f('fk_transactions_import_run_id'), 'transactions', 'import_runs',
        ['import_run_id'], ['id'], source_schema='portfolio', referent_schema='portfolio',
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint(op.f('fk_transactions_import_run_id'), 'transactions', schema='portfolio', type_='foreignkey')
    op.drop_index(op.f('ix_portfolio_transactions_import_run_id'), table_name='transactions', schema='portfolio')
    op.drop_column('transactions', 'import_run_id', schema='portfolio')
