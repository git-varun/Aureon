"""add_identity_and_multi_tenancy

Revision ID: dcc5c0493ba4
Revises: 00be0f841252
Create Date: 2026-06-13 15:51:05.270111

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'dcc5c0493ba4'
down_revision: Union[str, None] = '00be0f841252'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    schema_system = 'system' if bind.dialect.name != 'sqlite' else None

    # Create organizations table
    op.create_table('organizations',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('slug', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_organizations')),
        schema=schema_system
    )
    op.create_index(op.f('ix_system_organizations_slug'), 'organizations', ['slug'], unique=True, schema=schema_system)

    # Create users table
    op.create_table('users',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('password_hash', sa.String(), nullable=True),
        sa.Column('first_name', sa.String(), nullable=True),
        sa.Column('last_name', sa.String(), nullable=True),
        sa.Column('phone', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('is_verified', sa.Boolean(), nullable=False),
        sa.Column('profile_picture', sa.String(), nullable=True),
        sa.Column('google_id', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_users')),
        schema=schema_system
    )
    op.create_index(op.f('ix_system_users_email'), 'users', ['email'], unique=True, schema=schema_system)
    op.create_index(op.f('ix_system_users_google_id'), 'users', ['google_id'], unique=True, schema=schema_system)
    op.create_index(op.f('ix_system_users_phone'), 'users', ['phone'], unique=False, schema=schema_system)

    # Create organization_members table
    op.create_table('organization_members',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('organization_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('role', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['system.organizations.id'] if schema_system else ['organizations.id'], name=op.f('fk_organization_members_organization_id'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['system.users.id'] if schema_system else ['users.id'], name=op.f('fk_organization_members_user_id'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_organization_members')),
        schema=schema_system
    )
    op.create_index('idx_org_members_org_user', 'organization_members', ['organization_id', 'user_id'], unique=True, schema=schema_system)

    # Create invitations table
    op.create_table('invitations',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('organization_id', sa.Uuid(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('role', sa.String(), nullable=False),
        sa.Column('invited_by_id', sa.Uuid(), nullable=False),
        sa.Column('token', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['invited_by_id'], ['system.users.id'] if schema_system else ['users.id'], name=op.f('fk_invitations_invited_by_id'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['organization_id'], ['system.organizations.id'] if schema_system else ['organizations.id'], name=op.f('fk_invitations_organization_id'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_invitations')),
        schema=schema_system
    )
    op.create_index(op.f('ix_system_invitations_email'), 'invitations', ['email'], unique=False, schema=schema_system)
    op.create_index(op.f('ix_system_invitations_token'), 'invitations', ['token'], unique=True, schema=schema_system)

    # Create sessions table
    op.create_table('sessions',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('session_token', sa.String(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('ip_address', sa.String(), nullable=True),
        sa.Column('user_agent', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['system.users.id'] if schema_system else ['users.id'], name=op.f('fk_sessions_user_id'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_sessions')),
        schema=schema_system
    )
    op.create_index(op.f('ix_system_sessions_session_token'), 'sessions', ['session_token'], unique=True, schema=schema_system)


def downgrade() -> None:
    bind = op.get_bind()
    schema_system = 'system' if bind.dialect.name != 'sqlite' else None

    op.drop_index(op.f('ix_system_sessions_session_token'), table_name='sessions', schema=schema_system)
    op.drop_table('sessions', schema=schema_system)
    op.drop_index('idx_org_members_org_user', table_name='organization_members', schema=schema_system)
    op.drop_table('organization_members', schema=schema_system)
    op.drop_index(op.f('ix_system_invitations_token'), table_name='invitations', schema=schema_system)
    op.drop_index(op.f('ix_system_invitations_email'), table_name='invitations', schema=schema_system)
    op.drop_table('invitations', schema=schema_system)
    op.drop_index(op.f('ix_system_users_phone'), table_name='users', schema=schema_system)
    op.drop_index(op.f('ix_system_users_google_id'), table_name='users', schema=schema_system)
    op.drop_index(op.f('ix_system_users_email'), table_name='users', schema=schema_system)
    op.drop_table('users', schema=schema_system)
    op.drop_index(op.f('ix_system_organizations_slug'), table_name='organizations', schema=schema_system)
    op.drop_table('organizations', schema=schema_system)
