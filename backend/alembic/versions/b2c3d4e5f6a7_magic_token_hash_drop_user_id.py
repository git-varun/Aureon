"""magic_tokens: store token hash, drop user_id

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-24

Changes:
- Drop plaintext `token` column (replaced by `token_hash`)
- Add `token_hash` column (HMAC-SHA256 of the raw token, unique)
- Drop `user_id` column (was nullable and never used at verify time)
- Purge all existing rows — they are short-lived (15 min TTL) and their
  plaintext tokens cannot be rehashed without the originals.
"""
from alembic import op
import sqlalchemy as sa

revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing rows are unrecoverable (can't rehash plaintext we no longer have).
    # They're at most 15 minutes old and all expire naturally anyway.
    op.execute("DELETE FROM magic_tokens")

    op.add_column('magic_tokens', sa.Column('token_hash', sa.String(), nullable=False))
    op.create_index('ix_magic_tokens_token_hash', 'magic_tokens', ['token_hash'], unique=True)

    op.drop_index('ix_magic_tokens_token', table_name='magic_tokens')
    op.drop_column('magic_tokens', 'token')
    op.drop_column('magic_tokens', 'user_id')


def downgrade() -> None:
    op.add_column('magic_tokens', sa.Column('user_id', sa.Integer(), nullable=True))
    op.add_column('magic_tokens', sa.Column('token', sa.String(), nullable=False, server_default=''))
    op.create_index('ix_magic_tokens_token', 'magic_tokens', ['token'], unique=True)

    op.drop_index('ix_magic_tokens_token_hash', table_name='magic_tokens')
    op.drop_column('magic_tokens', 'token_hash')

    op.execute("ALTER TABLE magic_tokens ALTER COLUMN token DROP DEFAULT")
