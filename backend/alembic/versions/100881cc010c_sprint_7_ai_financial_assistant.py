"""sprint_7_ai_financial_assistant

Revision ID: 100881cc010c
Revises: 7b0cfbf6810b
Create Date: 2026-06-13 19:44:11.253102

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '100881cc010c'
down_revision: Union[str, None] = '7b0cfbf6810b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    schema_ai = 'ai' if bind.dialect.name != 'sqlite' else None
    schema_system = 'system' if bind.dialect.name != 'sqlite' else None
    
    if bind.dialect.name != 'sqlite':
        op.execute("CREATE SCHEMA IF NOT EXISTS ai")
    
    insp = sa.inspect(bind)
    def has_table(name: str, schema: str = None) -> bool:
        eff_schema = schema if bind.dialect.name != 'sqlite' else None
        return insp.has_table(name, schema=eff_schema)
    
    # 1. Create ai_briefings if not exists
    if not has_table('ai_briefings', 'ai'):
        op.create_table(
            'ai_briefings',
            sa.Column('id', sa.Uuid(), nullable=False),
            sa.Column('organization_id', sa.Uuid(), nullable=False),
            sa.Column('briefing_type', sa.String(length=30), nullable=False),
            sa.Column('symbol', sa.String(length=30), nullable=True),
            sa.Column('content', sa.JSON(), nullable=False),
            sa.Column('model_used', sa.String(length=100), nullable=False),
            sa.Column('prompt_tokens', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['organization_id'], [f'{schema_system}.organizations.id'] if schema_system else ['organizations.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            schema=schema_ai
        )
        op.create_index('idx_ai_briefings_org_type', 'ai_briefings', ['organization_id', 'briefing_type'], schema=schema_ai)

    # 2. Create ai_generations if not exists
    if not has_table('ai_generations', 'ai'):
        op.create_table(
            'ai_generations',
            sa.Column('id', sa.Uuid(), nullable=False),
            sa.Column('user_id', sa.Uuid(), nullable=True),
            sa.Column('feature_name', sa.String(length=64), nullable=False),
            sa.Column('provider', sa.String(length=64), nullable=False),
            sa.Column('model', sa.String(length=128), nullable=False),
            sa.Column('prompt_version', sa.String(length=32), nullable=True),
            sa.Column('prompt_text', sa.Text(), nullable=False),
            sa.Column('context_payload', sa.JSON(), nullable=True),
            sa.Column('retrieval_metadata', sa.JSON(), nullable=True),
            sa.Column('response_text', sa.Text(), nullable=False),
            sa.Column('prompt_tokens', sa.Integer(), nullable=True),
            sa.Column('completion_tokens', sa.Integer(), nullable=True),
            sa.Column('total_tokens', sa.Integer(), nullable=True),
            sa.Column('latency_ms', sa.Integer(), nullable=True),
            sa.Column('execution_trace', sa.JSON(), nullable=True),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('generation_parameters', sa.JSON(), nullable=False),
            sa.Column('prompt_sha256', sa.String(length=64), nullable=True),
            sa.Column('data_classification', sa.String(length=32), nullable=True),
            sa.Column('payload_retention_state', sa.String(length=32), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], [f'{schema_system}.users.id'] if schema_system else ['users.id'], ondelete='SET NULL'),
            sa.PrimaryKeyConstraint('id'),
            schema=schema_ai
        )
        op.create_index('idx_ai_generations_user_feature', 'ai_generations', ['user_id', 'feature_name'], schema=schema_ai)

    # 3. Create ai_evaluations if not exists
    if not has_table('ai_evaluations', 'ai'):
        op.create_table(
            'ai_evaluations',
            sa.Column('id', sa.Uuid(), nullable=False),
            sa.Column('generation_id', sa.Uuid(), nullable=False),
            sa.Column('faithfulness_score', sa.Numeric(), nullable=True),
            sa.Column('relevance_score', sa.Numeric(), nullable=True),
            sa.Column('data_reference_validated', sa.Boolean(), nullable=False),
            sa.Column('validation_details', sa.JSON(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['generation_id'], [f'{schema_ai}.ai_generations.id'] if schema_ai else ['ai_generations.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            schema=schema_ai
        )

    # 4. Create ai_feedback if not exists
    if not has_table('ai_feedback', 'ai'):
        op.create_table(
            'ai_feedback',
            sa.Column('id', sa.Uuid(), nullable=False),
            sa.Column('generation_id', sa.Uuid(), nullable=False),
            sa.Column('user_id', sa.Uuid(), nullable=True),
            sa.Column('rating', sa.Integer(), nullable=False),
            sa.Column('comment', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['generation_id'], [f'{schema_ai}.ai_generations.id'] if schema_ai else ['ai_generations.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['user_id'], [f'{schema_system}.users.id'] if schema_system else ['users.id'], ondelete='SET NULL'),
            sa.PrimaryKeyConstraint('id'),
            schema=schema_ai
        )


def downgrade() -> None:
    bind = op.get_bind()
    schema_ai = 'ai' if bind.dialect.name != 'sqlite' else None
    op.drop_table('ai_feedback', schema=schema_ai)
    op.drop_table('ai_evaluations', schema=schema_ai)
    op.drop_index('idx_ai_generations_user_feature', table_name='ai_generations', schema=schema_ai)
    op.drop_table('ai_generations', schema=schema_ai)
    op.drop_index('idx_ai_briefings_org_type', table_name='ai_briefings', schema=schema_ai)
    op.drop_table('ai_briefings', schema=schema_ai)

