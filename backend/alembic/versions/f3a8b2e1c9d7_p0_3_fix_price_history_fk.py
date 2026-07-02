"""p0_3_fix_price_history_fk_to_assets

Revision ID: f3a8b2e1c9d7
Revises: 96527d56e0bd
Create Date: 2026-07-01 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = 'f3a8b2e1c9d7'
down_revision: Union[str, None] = '96527d56e0bd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Repoint price_history.asset_id → market.assets.id instead of market.asset_snapshot.asset_id
    # This removes the circular dependency: ingest_quote can now log price history without
    # requiring a pre-existing asset_snapshot row.
    op.drop_constraint('fk_price_history_asset_id', 'price_history', schema='market', type_='foreignkey')
    op.create_foreign_key(
        'fk_price_history_asset_id',
        'price_history', 'assets',
        ['asset_id'], ['id'],
        source_schema='market', referent_schema='market',
        ondelete='CASCADE'
    )


def downgrade() -> None:
    op.drop_constraint('fk_price_history_asset_id', 'price_history', schema='market', type_='foreignkey')
    op.create_foreign_key(
        'fk_price_history_asset_id',
        'price_history', 'asset_snapshot',
        ['asset_id'], ['asset_id'],
        source_schema='market', referent_schema='market',
        ondelete='CASCADE'
    )
