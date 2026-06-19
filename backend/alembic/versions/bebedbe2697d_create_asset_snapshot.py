"""create_asset_snapshot

Revision ID: bebedbe2697d
Revises: 762c07784edc
Create Date: 2026-06-13 00:37:28.944966

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'bebedbe2697d'
down_revision: Union[str, None] = '762c07784edc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    schema_market = 'market' if bind.dialect.name != 'sqlite' else None
    schema_system = 'system' if bind.dialect.name != 'sqlite' else None
    schema_evaluation = 'evaluation' if bind.dialect.name != 'sqlite' else None

    # asset_snapshot table
    from sqlalchemy.dialects.postgresql import JSONB
    json_type = JSONB if bind.dialect.name != 'sqlite' else sa.JSON()
    op.create_table(
        'asset_snapshot',
        sa.Column('asset_id', sa.UUID(), nullable=False),
        sa.Column('price', sa.Numeric(), nullable=True),
        sa.Column('market_cap', sa.Numeric(), nullable=True),
        sa.Column('pe_ratio', sa.Numeric(), nullable=True),
        sa.Column('rsi', sa.Numeric(), nullable=True),
        sa.Column('momentum_score', sa.Numeric(), nullable=True),
        sa.Column('volatility_score', sa.Numeric(), nullable=True),
        sa.Column('sentiment_score', sa.Numeric(), nullable=True),
        sa.Column('payload', json_type, nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('asset_id', name=op.f('pk_asset_snapshot')),
        schema=schema_market
    )

    # 1. idx_asset_health_status on market.asset_health
    op.create_index(
        'idx_asset_health_status',
        'asset_health',
        ['status'],
        unique=False,
        schema=schema_market
    )

    # 2. idx_asset_health_updated_at on market.asset_health
    op.create_index(
        'idx_asset_health_updated_at',
        'asset_health',
        [sa.text('updated_at DESC')],
        unique=False,
        schema=schema_market
    )

    # 3. idx_asset_scores_asset_generated_at on evaluation.asset_scores
    op.create_index(
        'idx_asset_scores_asset_generated_at',
        'asset_scores',
        ['asset_id', sa.text('generated_at DESC')],
        unique=False,
        schema=schema_evaluation
    )

    # 4. idx_feature_snapshots_asset_snapshot_at on evaluation.feature_snapshots
    op.create_index(
        'idx_feature_snapshots_asset_snapshot_at',
        'feature_snapshots',
        ['asset_id', sa.text('snapshot_at DESC')],
        unique=False,
        schema=schema_evaluation
    )

    # 5. idx_provider_usage_provider_recorded_at on system.provider_usage
    op.create_index(
        'idx_provider_usage_provider_recorded_at',
        'provider_usage',
        ['provider_id', sa.text('recorded_at DESC')],
        unique=False,
        schema=schema_system
    )

    # 6. idx_failed_ingestions_created_at_desc on system.failed_ingestions
    op.create_index(
        'idx_failed_ingestions_created_at_desc',
        'failed_ingestions',
        [sa.text('created_at DESC')],
        unique=False,
        schema=schema_system
    )

    # 7. idx_failed_ingestions_is_exhausted on system.failed_ingestions
    op.create_index(
        'idx_failed_ingestions_is_exhausted',
        'failed_ingestions',
        ['is_exhausted'],
        unique=False,
        schema=schema_system
    )

    # 8. idx_job_runs_started_at_desc on system.job_runs
    op.create_index(
        'idx_job_runs_started_at_desc',
        'job_runs',
        [sa.text('started_at DESC')],
        unique=False,
        schema=schema_system
    )

    # 9. idx_job_runs_status on system.job_runs
    op.create_index(
        'idx_job_runs_status',
        'job_runs',
        ['status'],
        unique=False,
        schema=schema_system
    )


def downgrade() -> None:
    bind = op.get_bind()
    schema_market = 'market' if bind.dialect.name != 'sqlite' else None
    schema_system = 'system' if bind.dialect.name != 'sqlite' else None
    schema_evaluation = 'evaluation' if bind.dialect.name != 'sqlite' else None

    # Drop indexes
    op.drop_index('idx_job_runs_status', table_name='job_runs', schema=schema_system)
    op.drop_index('idx_job_runs_started_at_desc', table_name='job_runs', schema=schema_system)
    op.drop_index('idx_failed_ingestions_is_exhausted', table_name='failed_ingestions', schema=schema_system)
    op.drop_index('idx_failed_ingestions_created_at_desc', table_name='failed_ingestions', schema=schema_system)
    op.drop_index('idx_provider_usage_provider_recorded_at', table_name='provider_usage', schema=schema_system)
    op.drop_index('idx_feature_snapshots_asset_snapshot_at', table_name='feature_snapshots', schema=schema_evaluation)
    op.drop_index('idx_asset_scores_asset_generated_at', table_name='asset_scores', schema=schema_evaluation)
    op.drop_index('idx_asset_health_updated_at', table_name='asset_health', schema=schema_market)
    op.drop_index('idx_asset_health_status', table_name='asset_health', schema=schema_market)

    # Drop table
    op.drop_table('asset_snapshot', schema=schema_market)
