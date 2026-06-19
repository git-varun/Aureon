"""Sprint 1B implementation

Revision ID: c8de7c34fc8e
Revises: 941f27795b7c
Create Date: 2026-06-11 15:29:30.222939

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c8de7c34fc8e'
down_revision: Union[str, None] = '941f27795b7c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != 'sqlite':
        op.execute("CREATE SCHEMA IF NOT EXISTS market")
        op.execute("CREATE SCHEMA IF NOT EXISTS portfolio")
        op.execute("CREATE SCHEMA IF NOT EXISTS evaluation")
        op.execute("CREATE SCHEMA IF NOT EXISTS system")

    # system.providers
    op.create_table(
        'providers',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('priority', sa.Integer(), nullable=True),
        sa.Column('is_enabled', sa.Boolean(), nullable=False, server_default=sa.text('1') if bind.dialect.name == 'sqlite' else sa.text('true')),
        sa.Column('health_status', sa.String(), nullable=True),
        sa.Column('last_success_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_providers')),
        sa.UniqueConstraint('name', name=op.f('uq_providers_name')),
        schema='system' if bind.dialect.name != 'sqlite' else None
    )

    # system.provider_usage
    op.create_table(
        'provider_usage',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('provider_id', sa.UUID(), nullable=False),
        sa.Column('endpoint', sa.String(), nullable=False),
        sa.Column('request_count', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('cost_estimate', sa.Numeric(), nullable=False, server_default='0.0'),
        sa.Column('recorded_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_provider_usage')),
        schema='system' if bind.dialect.name != 'sqlite' else None
    )

    # portfolio.portfolio_snapshot
    from sqlalchemy.dialects import postgresql
    allocation_col_type = postgresql.JSONB(astext_type=sa.Text()) if bind.dialect.name != 'sqlite' else sa.JSON()
    op.create_table(
        'portfolio_snapshot',
        sa.Column('portfolio_id', sa.UUID(), nullable=False),
        sa.Column('market_value', sa.Numeric(), nullable=True),
        sa.Column('cash_balance', sa.Numeric(), nullable=True),
        sa.Column('allocation', allocation_col_type, nullable=True),
        sa.Column('daily_return', sa.Numeric(), nullable=True),
        sa.Column('total_return', sa.Numeric(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('portfolio_id', name=op.f('pk_portfolio_snapshot')),
        schema='portfolio' if bind.dialect.name != 'sqlite' else None
    )


def downgrade() -> None:
    bind = op.get_bind()
    schema_portfolio = 'portfolio' if bind.dialect.name != 'sqlite' else None
    schema_system = 'system' if bind.dialect.name != 'sqlite' else None

    op.drop_table('portfolio_snapshot', schema=schema_portfolio)
    op.drop_table('provider_usage', schema=schema_system)
    op.drop_table('providers', schema=schema_system)

    if bind.dialect.name != 'sqlite':
        op.execute("DROP SCHEMA IF EXISTS system CASCADE")
        op.execute("DROP SCHEMA IF EXISTS evaluation CASCADE")
        op.execute("DROP SCHEMA IF EXISTS portfolio CASCADE")
        op.execute("DROP SCHEMA IF EXISTS market CASCADE")
