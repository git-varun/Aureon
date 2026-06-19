"""sprint_8_hardening

Revision ID: e1e3012e8670
Revises: 100881cc010c
Create Date: 2026-06-15 15:57:30.772321

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e1e3012e8670'
down_revision: Union[str, None] = '100881cc010c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    schema_market = 'market' if bind.dialect.name != 'sqlite' else None
    schema_system = 'system' if bind.dialect.name != 'sqlite' else None

    # Create assets table
    op.create_table(
        'assets',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('symbol', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('asset_class', sa.String(), nullable=False),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.Column('classification', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        schema=schema_market
    )
    op.create_index('idx_assets_symbol', 'assets', ['symbol'], unique=True, schema=schema_market)

    # Create price_history table
    op.create_table(
        'price_history',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('asset_id', sa.Uuid(), nullable=False),
        sa.Column('symbol', sa.String(), nullable=False),
        sa.Column('price', sa.Numeric(), nullable=False),
        sa.Column('volume', sa.Numeric(), nullable=True),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['asset_id'], [f'{schema_market}.asset_snapshot.asset_id'] if schema_market else ['asset_snapshot.asset_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        schema=schema_market
    )
    op.create_index('idx_price_history_asset_time', 'price_history', ['asset_id', 'timestamp'], schema=schema_market)

    # Create audit_logs table
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('actor_id', sa.Uuid(), nullable=True),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('entity_type', sa.String(), nullable=False),
        sa.Column('entity_id', sa.String(), nullable=True),
        sa.Column('details', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['actor_id'], [f'{schema_system}.users.id'] if schema_system else ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        schema=schema_system
    )
    op.create_index('idx_audit_logs_action_time', 'audit_logs', ['action', 'created_at'], schema=schema_system)


def downgrade() -> None:
    bind = op.get_bind()
    schema_market = 'market' if bind.dialect.name != 'sqlite' else None
    schema_system = 'system' if bind.dialect.name != 'sqlite' else None

    op.drop_index('idx_audit_logs_action_time', table_name='audit_logs', schema=schema_system)
    op.drop_table('audit_logs', schema=schema_system)
    op.drop_index('idx_price_history_asset_time', table_name='price_history', schema=schema_market)
    op.drop_table('price_history', schema=schema_market)
    op.drop_index('idx_assets_symbol', table_name='assets', schema=schema_market)
    op.drop_table('assets', schema=schema_market)

