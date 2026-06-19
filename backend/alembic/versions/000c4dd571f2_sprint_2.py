"""Sprint 2

Revision ID: 000c4dd571f2
Revises: c8de7c34fc8e
Create Date: 2026-06-11 16:00:59.956035

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '000c4dd571f2'
down_revision: Union[str, None] = 'c8de7c34fc8e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    from sqlalchemy.dialects import postgresql
    json_type = postgresql.JSONB(astext_type=sa.Text()) if bind.dialect.name != 'sqlite' else sa.JSON()
    schema_system = 'system' if bind.dialect.name != 'sqlite' else None
    schema_market = 'market' if bind.dialect.name != 'sqlite' else None

    op.create_table(
        'failed_ingestions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('provider', sa.String(), nullable=False),
        sa.Column('payload', json_type, nullable=False),
        sa.Column('error', sa.String(), nullable=False),
        sa.Column('attempts', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_failed_ingestions')),
        schema=schema_system
    )

    op.create_table(
        'latest_quotes',
        sa.Column('symbol', sa.String(), nullable=False),
        sa.Column('price', sa.Numeric(), nullable=False),
        sa.Column('volume', sa.Numeric(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('symbol', name=op.f('pk_latest_quotes')),
        schema=schema_market
    )

def downgrade() -> None:
    bind = op.get_bind()
    schema_system = 'system' if bind.dialect.name != 'sqlite' else None
    schema_market = 'market' if bind.dialect.name != 'sqlite' else None

    op.drop_table('latest_quotes', schema=schema_market)
    op.drop_table('failed_ingestions', schema=schema_system)
