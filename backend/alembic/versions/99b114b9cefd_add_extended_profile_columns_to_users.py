"""add extended profile columns to users

Revision ID: 99b114b9cefd
Revises: 8f596576e4a6
Create Date: 2026-05-21 19:01:29.605169

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '99b114b9cefd'
down_revision: Union[str, None] = '8f596576e4a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture VARCHAR")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT")
    # Migrate name → first_name for existing rows (safe if name column doesn't exist)
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='name') THEN
                UPDATE users SET first_name = name WHERE name IS NOT NULL AND first_name IS NULL;
                ALTER TABLE users DROP COLUMN name;
            END IF;
        END $$
    """)


def downgrade() -> None:
    op.add_column('users', sa.Column('name', sa.VARCHAR(), autoincrement=False, nullable=True))
    op.execute("UPDATE users SET name = first_name WHERE first_name IS NOT NULL")
    op.drop_column('users', 'bio')
    op.drop_column('users', 'profile_picture')
    op.drop_column('users', 'phone')
    op.drop_column('users', 'last_name')
    op.drop_column('users', 'first_name')
