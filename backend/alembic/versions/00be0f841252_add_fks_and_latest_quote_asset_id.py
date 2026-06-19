"""add_fks_and_latest_quote_asset_id

Revision ID: 00be0f841252
Revises: bebedbe2697d
Create Date: 2026-06-13 00:40:39.598735

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '00be0f841252'
down_revision: Union[str, None] = 'bebedbe2697d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    schema_market = 'market' if bind.dialect.name != 'sqlite' else None
    schema_system = 'system' if bind.dialect.name != 'sqlite' else None
    schema_evaluation = 'evaluation' if bind.dialect.name != 'sqlite' else None

    # Add asset_id column to latest_quotes
    with op.batch_alter_table('latest_quotes', schema=schema_market) as batch_op:
        batch_op.add_column(sa.Column('asset_id', sa.UUID(), nullable=True))
        batch_op.create_unique_constraint('uq_latest_quotes_asset_id', ['asset_id'])

    # Add foreign key to provider_usage
    with op.batch_alter_table('provider_usage', schema=schema_system) as batch_op:
        batch_op.create_foreign_key(
            'fk_provider_usage_provider_id',
            'providers',
            ['provider_id'],
            ['id'],
            referent_schema=schema_system,
            ondelete='CASCADE'
        )

    # Add foreign key to asset_features
    with op.batch_alter_table('asset_features', schema=schema_market) as batch_op:
        batch_op.create_foreign_key(
            'fk_asset_features_asset_id',
            'asset_snapshot',
            ['asset_id'],
            ['asset_id'],
            referent_schema=schema_market,
            ondelete='CASCADE'
        )

    # Add foreign key to asset_health
    with op.batch_alter_table('asset_health', schema=schema_market) as batch_op:
        batch_op.create_foreign_key(
            'fk_asset_health_asset_id',
            'asset_snapshot',
            ['asset_id'],
            ['asset_id'],
            referent_schema=schema_market,
            ondelete='CASCADE'
        )

    # Add foreign key to asset_scores
    with op.batch_alter_table('asset_scores', schema=schema_evaluation) as batch_op:
        batch_op.create_foreign_key(
            'fk_asset_scores_asset_id',
            'asset_snapshot',
            ['asset_id'],
            ['asset_id'],
            referent_schema=schema_market,
            ondelete='CASCADE'
        )

    # Add foreign key to feature_snapshots
    with op.batch_alter_table('feature_snapshots', schema=schema_evaluation) as batch_op:
        batch_op.create_foreign_key(
            'fk_feature_snapshots_asset_id',
            'asset_snapshot',
            ['asset_id'],
            ['asset_id'],
            referent_schema=schema_market,
            ondelete='CASCADE'
        )


def downgrade() -> None:
    bind = op.get_bind()
    schema_market = 'market' if bind.dialect.name != 'sqlite' else None
    schema_system = 'system' if bind.dialect.name != 'sqlite' else None
    schema_evaluation = 'evaluation' if bind.dialect.name != 'sqlite' else None

    # Drop foreign keys
    with op.batch_alter_table('feature_snapshots', schema=schema_evaluation) as batch_op:
        batch_op.drop_constraint('fk_feature_snapshots_asset_id', type_='foreignkey')

    with op.batch_alter_table('asset_scores', schema=schema_evaluation) as batch_op:
        batch_op.drop_constraint('fk_asset_scores_asset_id', type_='foreignkey')

    with op.batch_alter_table('asset_health', schema=schema_market) as batch_op:
        batch_op.drop_constraint('fk_asset_health_asset_id', type_='foreignkey')

    with op.batch_alter_table('asset_features', schema=schema_market) as batch_op:
        batch_op.drop_constraint('fk_asset_features_asset_id', type_='foreignkey')

    with op.batch_alter_table('provider_usage', schema=schema_system) as batch_op:
        batch_op.drop_constraint('fk_provider_usage_provider_id', type_='foreignkey')

    # Drop column and unique constraint
    with op.batch_alter_table('latest_quotes', schema=schema_market) as batch_op:
        batch_op.drop_constraint('uq_latest_quotes_asset_id', type_='unique')
        batch_op.drop_column('asset_id')
