"""add wallet/futures fields to positions and dedup index on transactions

Revision ID: c1a9f4d7e2b6
Revises: b7c2e4f19a3d
Create Date: 2026-07-06 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = 'c1a9f4d7e2b6'
down_revision: Union[str, None] = 'b7c2e4f19a3d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('positions', sa.Column('wallet', sa.String(), nullable=False, server_default='spot'), schema='portfolio')
    op.add_column('positions', sa.Column('leverage', sa.Numeric(), nullable=True), schema='portfolio')
    op.add_column('positions', sa.Column('liquidation_price', sa.Numeric(), nullable=True), schema='portfolio')
    op.add_column('positions', sa.Column('unrealized_pnl', sa.Numeric(), nullable=True), schema='portfolio')
    op.add_column('positions', sa.Column('side', sa.String(), nullable=True), schema='portfolio')

    op.create_index(
        'ix_transactions_broker_dedup',
        'transactions',
        ['portfolio_id', 'broker', 'broker_reference'],
        unique=True,
        schema='portfolio',
        postgresql_where=sa.text('broker_reference IS NOT NULL'),
    )


def downgrade() -> None:
    op.drop_index('ix_transactions_broker_dedup', table_name='transactions', schema='portfolio')
    op.drop_column('positions', 'side', schema='portfolio')
    op.drop_column('positions', 'unrealized_pnl', schema='portfolio')
    op.drop_column('positions', 'liquidation_price', schema='portfolio')
    op.drop_column('positions', 'leverage', schema='portfolio')
    op.drop_column('positions', 'wallet', schema='portfolio')
