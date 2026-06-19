"""sprint_6_platform_features

Revision ID: 7b0cfbf6810b
Revises: 5c42f76a723a
Create Date: 2026-06-13 19:35:50.059195

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '7b0cfbf6810b'
down_revision: Union[str, None] = '5c42f76a723a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != 'sqlite':
        op.execute("CREATE SCHEMA IF NOT EXISTS config")
        op.execute("CREATE SCHEMA IF NOT EXISTS watchlist")
        op.execute("CREATE SCHEMA IF NOT EXISTS notification")
        op.execute("CREATE SCHEMA IF NOT EXISTS news")
    insp = sa.inspect(bind)

    def has_table(name: str, schema: str = None) -> bool:
        effective_schema = schema
        if bind.dialect.name == 'sqlite':
            effective_schema = None
        return insp.has_table(name, schema=effective_schema)

    def has_index(idx_name: str, tbl_name: str, schema: str = None) -> bool:
        effective_schema = schema
        if bind.dialect.name == 'sqlite':
            effective_schema = None
        if not insp.has_table(tbl_name, schema=effective_schema):
            return False
        indexes = insp.get_indexes(tbl_name, schema=effective_schema)
        return any(idx['name'] == idx_name for idx in indexes)

    # ── config schema ──
    if not has_table('provider_configs', 'config'):
        op.create_table('provider_configs',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('provider_name', sa.String(length=64), nullable=False),
            sa.Column('provider_type', sa.String(length=32), nullable=False),
            sa.Column('enabled', sa.Boolean(), nullable=False),
            sa.Column('key_names', sa.Text(), nullable=False),
            sa.Column('encrypted_keys', sa.Text(), nullable=False),
            sa.Column('config', sa.Text(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint('id', name=op.f('pk_provider_configs')),
            schema='config'
        )
    if not has_index('ix_config_provider_configs_id', 'provider_configs', 'config'):
        op.create_index(op.f('ix_config_provider_configs_id'), 'provider_configs', ['id'], unique=False, schema='config')
    if not has_index('ix_config_provider_configs_provider_name', 'provider_configs', 'config'):
        op.create_index(op.f('ix_config_provider_configs_provider_name'), 'provider_configs', ['provider_name'], unique=True, schema='config')

    if not has_table('job_configs', 'config'):
        op.create_table('job_configs',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('job_name', sa.String(length=64), nullable=False),
            sa.Column('enabled', sa.Boolean(), nullable=False),
            sa.Column('cron_expression', sa.String(length=64), nullable=False),
            sa.Column('last_run_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('next_run_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('job_tier', sa.String(length=16), nullable=False),
            sa.Column('config', sa.Text(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint('id', name=op.f('pk_job_configs')),
            schema='config'
        )
    if not has_index('ix_config_job_configs_id', 'job_configs', 'config'):
        op.create_index(op.f('ix_config_job_configs_id'), 'job_configs', ['id'], unique=False, schema='config')
    if not has_index('ix_config_job_configs_job_name', 'job_configs', 'config'):
        op.create_index(op.f('ix_config_job_configs_job_name'), 'job_configs', ['job_name'], unique=True, schema='config')

    if not has_table('allocation_targets', 'config'):
        op.create_table('allocation_targets',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('asset_class', sa.String(length=40), nullable=False),
            sa.Column('target_pct', sa.Integer(), nullable=False),
            sa.Column('band_low_pct', sa.Integer(), nullable=True),
            sa.Column('band_high_pct', sa.Integer(), nullable=True),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint('id', name=op.f('pk_allocation_targets')),
            schema='config'
        )
    if not has_index('ix_config_allocation_targets_asset_class', 'allocation_targets', 'config'):
        op.create_index(op.f('ix_config_allocation_targets_asset_class'), 'allocation_targets', ['asset_class'], unique=True, schema='config')
    if not has_index('ix_config_allocation_targets_id', 'allocation_targets', 'config'):
        op.create_index(op.f('ix_config_allocation_targets_id'), 'allocation_targets', ['id'], unique=False, schema='config')

    if not has_table('job_logs', 'config'):
        op.create_table('job_logs',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('job_name', sa.String(length=64), nullable=False),
            sa.Column('status', sa.String(length=20), nullable=False),
            sa.Column('task_id', sa.String(length=512), nullable=True),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
            sa.Column('ended_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('duration_ms', sa.Integer(), nullable=True),
            sa.PrimaryKeyConstraint('id', name=op.f('pk_job_logs')),
            schema='config'
        )
    if not has_index('ix_config_job_logs_id', 'job_logs', 'config'):
        op.create_index(op.f('ix_config_job_logs_id'), 'job_logs', ['id'], unique=False, schema='config')
    if not has_index('ix_config_job_logs_job_name', 'job_logs', 'config'):
        op.create_index(op.f('ix_config_job_logs_job_name'), 'job_logs', ['job_name'], unique=False, schema='config')

    # ── watchlist schema ──
    if not has_table('watchlists', 'watchlist'):
        op.create_table('watchlists',
            sa.Column('user_id', sa.Uuid(), nullable=False),
            sa.Column('organization_id', sa.Uuid(), nullable=True),
            sa.Column('name', sa.String(length=120), nullable=False),
            sa.Column('id', sa.Uuid(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['organization_id'], ['system.organizations.id'], name=op.f('fk_watchlists_organization_id'), ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['user_id'], ['system.users.id'], name=op.f('fk_watchlists_user_id'), ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id', name=op.f('pk_watchlists')),
            sa.UniqueConstraint('user_id', 'name', name='uq_watchlist_user_name'),
            schema='watchlist'
        )
    if not has_index('ix_watchlist_watchlists_organization_id', 'watchlists', 'watchlist'):
        op.create_index(op.f('ix_watchlist_watchlists_organization_id'), 'watchlists', ['organization_id'], unique=False, schema='watchlist')
    if not has_index('ix_watchlist_watchlists_user_id', 'watchlists', 'watchlist'):
        op.create_index(op.f('ix_watchlist_watchlists_user_id'), 'watchlists', ['user_id'], unique=False, schema='watchlist')

    if not has_table('watchlist_symbols', 'watchlist'):
        op.create_table('watchlist_symbols',
            sa.Column('watchlist_id', sa.Uuid(), nullable=False),
            sa.Column('symbol', sa.String(length=60), nullable=False),
            sa.Column('alert_price', sa.Numeric(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('id', sa.Uuid(), nullable=False),
            sa.ForeignKeyConstraint(['watchlist_id'], ['watchlist.watchlists.id'], name=op.f('fk_watchlist_symbols_watchlist_id'), ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id', name=op.f('pk_watchlist_symbols')),
            sa.UniqueConstraint('watchlist_id', 'symbol', name='uq_watchlist_symbol'),
            schema='watchlist'
        )

    # ── notification schema ──
    if not has_table('web_notifications', 'notification'):
        op.create_table('web_notifications',
            sa.Column('user_id', sa.Uuid(), nullable=True),
            sa.Column('title', sa.String(), nullable=False),
            sa.Column('message', sa.Text(), nullable=False),
            sa.Column('type', sa.String(), nullable=False),
            sa.Column('read', sa.Boolean(), nullable=False),
            sa.Column('id', sa.Uuid(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['system.users.id'], name=op.f('fk_web_notifications_user_id'), ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id', name=op.f('pk_web_notifications')),
            schema='notification'
        )
    if not has_index('ix_notification_web_notifications_user_id', 'web_notifications', 'notification'):
        op.create_index(op.f('ix_notification_web_notifications_user_id'), 'web_notifications', ['user_id'], unique=False, schema='notification')

    # ── news schema ──
    if not has_table('news', 'news'):
        op.create_table('news',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('title', sa.String(), nullable=False),
            sa.Column('content', sa.Text(), nullable=True),
            sa.Column('summary', sa.Text(), nullable=True),
            sa.Column('source', sa.String(), nullable=False),
            sa.Column('url', sa.String(), nullable=True),
            sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('sentiment_score', sa.Float(), nullable=True),
            sa.Column('relevance_score', sa.Float(), nullable=True),
            sa.Column('symbols', sa.String(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
            sa.PrimaryKeyConstraint('id', name=op.f('pk_news')),
            sa.UniqueConstraint('url', name=op.f('uq_news_url')),
            schema='news'
        )
    if not has_index('ix_news_news_id', 'news', 'news'):
        op.create_index(op.f('ix_news_news_id'), 'news', ['id'], unique=False, schema='news')

    if not has_table('news_assets', 'news'):
        op.create_table('news_assets',
            sa.Column('news_id', sa.Integer(), nullable=False),
            sa.Column('asset_id', sa.Uuid(), nullable=False),
            sa.ForeignKeyConstraint(['asset_id'], ['market.asset_snapshot.asset_id'], name=op.f('fk_news_assets_asset_id'), ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['news_id'], ['news.news.id'], name=op.f('fk_news_assets_news_id'), ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('news_id', 'asset_id', name=op.f('pk_news_assets')),
            schema='news'
        )
    if not has_index('idx_news_assets_asset', 'news_assets', 'news'):
        op.create_index('idx_news_assets_asset', 'news_assets', ['asset_id'], unique=False, schema='news')

    if not has_table('asset_sentiment_snapshots', 'news'):
        op.create_table('asset_sentiment_snapshots',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('asset_id', sa.Uuid(), nullable=False),
            sa.Column('snapshot_date', sa.DateTime(), nullable=False),
            sa.Column('avg_sentiment_7d', sa.Float(), nullable=True),
            sa.Column('avg_sentiment_30d', sa.Float(), nullable=True),
            sa.Column('article_count_7d', sa.Integer(), nullable=True),
            sa.Column('trend', sa.String(length=20), nullable=True),
            sa.Column('computed_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
            sa.ForeignKeyConstraint(['asset_id'], ['market.asset_snapshot.asset_id'], name=op.f('fk_asset_sentiment_snapshots_asset_id')),
            sa.PrimaryKeyConstraint('id', name=op.f('pk_asset_sentiment_snapshots')),
            sa.UniqueConstraint('asset_id', 'snapshot_date', name='uq_sentiment_asset_date'),
            schema='news'
        )


def downgrade() -> None:
    # news
    op.drop_table('asset_sentiment_snapshots', schema='news')
    op.drop_index('idx_news_assets_asset', table_name='news_assets', schema='news')
    op.drop_table('news_assets', schema='news')
    op.drop_index(op.f('ix_news_news_id'), table_name='news', schema='news')
    op.drop_table('news', schema='news')

    # notification
    op.drop_index(op.f('ix_notification_web_notifications_user_id'), table_name='web_notifications', schema='notification')
    op.drop_table('web_notifications', schema='notification')

    # watchlist
    op.drop_table('watchlist_symbols', schema='watchlist')
    op.drop_index(op.f('ix_watchlist_watchlists_user_id'), table_name='watchlists', schema='watchlist')
    op.drop_index(op.f('ix_watchlist_watchlists_organization_id'), table_name='watchlists', schema='watchlist')
    op.drop_table('watchlists', schema='watchlist')

    # config
    op.drop_index(op.f('ix_config_job_logs_job_name'), table_name='job_logs', schema='config')
    op.drop_index(op.f('ix_config_job_logs_id'), table_name='job_logs', schema='config')
    op.drop_table('job_logs', schema='config')
    op.drop_index(op.f('ix_config_allocation_targets_id'), table_name='allocation_targets', schema='config')
    op.drop_index(op.f('ix_config_allocation_targets_asset_class'), table_name='allocation_targets', schema='config')
    op.drop_table('allocation_targets', schema='config')
    op.drop_index(op.f('ix_config_job_configs_job_name'), table_name='job_configs', schema='config')
    op.drop_index(op.f('ix_config_job_configs_id'), table_name='job_configs', schema='config')
    op.drop_table('job_configs', schema='config')
    op.drop_index(op.f('ix_config_provider_configs_provider_name'), table_name='provider_configs', schema='config')
    op.drop_index(op.f('ix_config_provider_configs_id'), table_name='provider_configs', schema='config')
    op.drop_table('provider_configs', schema='config')
