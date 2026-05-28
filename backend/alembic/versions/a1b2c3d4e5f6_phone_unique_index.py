"""Add unique index on users.phone

Revision ID: a1b2c3d4e5f6
Revises: 99b114b9cefd
Create Date: 2026-05-22
"""
from typing import Union
from alembic import op

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '99b114b9cefd'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Remove duplicate phone values before enforcing uniqueness (keep newest row per phone)
    op.execute("""
        DELETE FROM users
        WHERE id NOT IN (
            SELECT DISTINCT ON (phone) id
            FROM users
            WHERE phone IS NOT NULL
            ORDER BY phone, id DESC
        )
        AND phone IS NOT NULL
    """)
    op.create_index('ix_users_phone', 'users', ['phone'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_users_phone', table_name='users')
