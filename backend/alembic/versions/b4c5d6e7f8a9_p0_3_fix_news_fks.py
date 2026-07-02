"""p0_3_fix_news_fks_to_assets

Revision ID: b4c5d6e7f8a9
Revises: f3a8b2e1c9d7
Create Date: 2026-07-01 00:01:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'b4c5d6e7f8a9'
down_revision: Union[str, None] = 'f3a8b2e1c9d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # news.news_assets — repoint from asset_snapshot to assets
    op.drop_constraint('fk_news_assets_asset_id', 'news_assets', schema='news', type_='foreignkey')
    op.create_foreign_key(
        'fk_news_assets_asset_id',
        'news_assets', 'assets',
        ['asset_id'], ['id'],
        source_schema='news', referent_schema='market',
        ondelete='CASCADE'
    )

    # news.asset_sentiment_snapshots — repoint from asset_snapshot to assets
    op.drop_constraint('fk_asset_sentiment_snapshots_asset_id', 'asset_sentiment_snapshots', schema='news', type_='foreignkey')
    op.create_foreign_key(
        'fk_asset_sentiment_snapshots_asset_id',
        'asset_sentiment_snapshots', 'assets',
        ['asset_id'], ['id'],
        source_schema='news', referent_schema='market',
        ondelete='CASCADE'
    )


def downgrade() -> None:
    op.drop_constraint('fk_news_assets_asset_id', 'news_assets', schema='news', type_='foreignkey')
    op.create_foreign_key(
        'fk_news_assets_asset_id',
        'news_assets', 'asset_snapshot',
        ['asset_id'], ['asset_id'],
        source_schema='news', referent_schema='market',
        ondelete='CASCADE'
    )

    op.drop_constraint('fk_asset_sentiment_snapshots_asset_id', 'asset_sentiment_snapshots', schema='news', type_='foreignkey')
    op.create_foreign_key(
        'fk_asset_sentiment_snapshots_asset_id',
        'asset_sentiment_snapshots', 'asset_snapshot',
        ['asset_id'], ['asset_id'],
        source_schema='news', referent_schema='market',
        ondelete='CASCADE'
    )
