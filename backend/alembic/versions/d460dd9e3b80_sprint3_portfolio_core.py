"""sprint3_portfolio_core

Revision ID: d460dd9e3b80
Revises: dcc5c0493ba4
Create Date: 2026-06-13 19:03:04.787241

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd460dd9e3b80'
down_revision: Union[str, None] = 'dcc5c0493ba4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create portfolios table
    op.create_table(
        'portfolios',
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('organization_id', sa.Uuid(), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['system.organizations.id'], name=op.f('fk_portfolios_organization_id'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_portfolios')),
        schema='portfolio'
    )
    
    # Create transactions table
    op.create_table(
        'transactions',
        sa.Column('portfolio_id', sa.Uuid(), nullable=False),
        sa.Column('symbol', sa.String(), nullable=False),
        sa.Column('asset_id', sa.Uuid(), nullable=True),
        sa.Column('transaction_type', sa.String(), nullable=False),
        sa.Column('quantity', sa.Numeric(), nullable=False),
        sa.Column('price', sa.Numeric(), nullable=False),
        sa.Column('transaction_date', sa.DateTime(), nullable=False),
        sa.Column('fees', sa.Numeric(), nullable=False),
        sa.Column('taxes', sa.Numeric(), nullable=False),
        sa.Column('notes', sa.String(), nullable=True),
        sa.Column('broker', sa.String(), nullable=True),
        sa.Column('broker_reference', sa.String(), nullable=True),
        sa.Column('kind', sa.String(), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['asset_id'], ['market.asset_snapshot.asset_id'], name=op.f('fk_transactions_asset_id'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['portfolio_id'], ['portfolio.portfolios.id'], name=op.f('fk_transactions_portfolio_id'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_transactions')),
        schema='portfolio'
    )
    op.create_index(op.f('ix_portfolio_transactions_symbol'), 'transactions', ['symbol'], unique=False, schema='portfolio')
    op.create_index(op.f('ix_portfolio_transactions_transaction_date'), 'transactions', ['transaction_date'], unique=False, schema='portfolio')

    # Create positions table
    op.create_table(
        'positions',
        sa.Column('portfolio_id', sa.Uuid(), nullable=False),
        sa.Column('symbol', sa.String(), nullable=False),
        sa.Column('asset_id', sa.Uuid(), nullable=True),
        sa.Column('quantity', sa.Numeric(), nullable=False),
        sa.Column('avg_buy_price', sa.Numeric(), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['asset_id'], ['market.asset_snapshot.asset_id'], name=op.f('fk_positions_asset_id'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['portfolio_id'], ['portfolio.portfolios.id'], name=op.f('fk_positions_portfolio_id'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_positions')),
        schema='portfolio'
    )
    op.create_index('idx_positions_portfolio_symbol', 'positions', ['portfolio_id', 'symbol'], unique=True, schema='portfolio')

    # Create snapshots table
    op.create_table(
        'snapshots',
        sa.Column('portfolio_id', sa.Uuid(), nullable=False),
        sa.Column('market_value', sa.Numeric(), nullable=True),
        sa.Column('cash_balance', sa.Numeric(), nullable=True),
        sa.Column('allocation', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=True),
        sa.Column('daily_return', sa.Numeric(), nullable=True),
        sa.Column('total_return', sa.Numeric(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['portfolio_id'], ['portfolio.portfolios.id'], name=op.f('fk_snapshots_portfolio_id'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('portfolio_id', name=op.f('pk_snapshots')),
        schema='portfolio'
    )


def downgrade() -> None:
    # Drop snapshots
    op.drop_table('snapshots', schema='portfolio')
    
    # Drop positions
    op.drop_index('idx_positions_portfolio_symbol', table_name='positions', schema='portfolio')
    op.drop_table('positions', schema='portfolio')
    
    # Drop transactions
    op.drop_index(op.f('ix_portfolio_transactions_transaction_date'), table_name='transactions', schema='portfolio')
    op.drop_index(op.f('ix_portfolio_transactions_symbol'), table_name='transactions', schema='portfolio')
    op.drop_table('transactions', schema='portfolio')
    
    # Drop portfolios
    op.drop_table('portfolios', schema='portfolio')
