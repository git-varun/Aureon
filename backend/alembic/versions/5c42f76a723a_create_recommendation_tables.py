"""create_recommendation_tables

Revision ID: 5c42f76a723a
Revises: d460dd9e3b80
Create Date: 2026-06-13 19:24:58.116551

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '5c42f76a723a'
down_revision: Union[str, None] = 'd460dd9e3b80'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != 'sqlite':
        op.execute("CREATE SCHEMA IF NOT EXISTS recommendation")
    op.create_table('recommendations',
    sa.Column('organization_id', sa.Uuid(), nullable=False),
    sa.Column('asset_id', sa.Uuid(), nullable=False),
    sa.Column('recommendation_state', sa.String(length=20), nullable=False),
    sa.Column('confidence_score', sa.Numeric(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('version', sa.String(length=20), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['asset_id'], ['market.asset_snapshot.asset_id'], name=op.f('fk_recommendations_asset_id'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['organization_id'], ['system.organizations.id'], name=op.f('fk_recommendations_organization_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_recommendations')),
    schema='recommendation'
    )
    op.create_index('idx_recommendations_asset', 'recommendations', ['asset_id'], unique=False, schema='recommendation')
    op.create_index('idx_recommendations_org_status', 'recommendations', ['organization_id', 'status'], unique=False, schema='recommendation')

    op.create_table('recommendation_explanations',
    sa.Column('recommendation_id', sa.Uuid(), nullable=False),
    sa.Column('rules_matched', sa.JSON(), nullable=False),
    sa.Column('reasoning', sa.String(), nullable=False),
    sa.Column('confidence_factors', sa.JSON(), nullable=False),
    sa.ForeignKeyConstraint(['recommendation_id'], ['recommendation.recommendations.id'], name=op.f('fk_recommendation_explanations_recommendation_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('recommendation_id', name=op.f('pk_recommendation_explanations')),
    schema='recommendation'
    )

    op.create_table('recommendation_outcomes',
    sa.Column('recommendation_id', sa.Uuid(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('action_taken_at', sa.DateTime(), nullable=False),
    sa.Column('dismiss_reason', sa.String(), nullable=True),
    sa.Column('ledger_transaction_id', sa.Uuid(), nullable=True),
    sa.Column('predicted_impact', sa.Numeric(), nullable=True),
    sa.Column('realized_impact', sa.Numeric(), nullable=True),
    sa.ForeignKeyConstraint(['ledger_transaction_id'], ['portfolio.transactions.id'], name=op.f('fk_recommendation_outcomes_ledger_transaction_id'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['recommendation_id'], ['recommendation.recommendations.id'], name=op.f('fk_recommendation_outcomes_recommendation_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('recommendation_id', name=op.f('pk_recommendation_outcomes')),
    schema='recommendation'
    )


def downgrade() -> None:
    op.drop_table('recommendation_outcomes', schema='recommendation')
    op.drop_table('recommendation_explanations', schema='recommendation')
    op.drop_index('idx_recommendations_org_status', table_name='recommendations', schema='recommendation')
    op.drop_index('idx_recommendations_asset', table_name='recommendations', schema='recommendation')
    op.drop_table('recommendations', schema='recommendation')
