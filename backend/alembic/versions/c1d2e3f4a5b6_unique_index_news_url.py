"""Add unique index to news.url (with pre-flight deduplification).

Revision ID: c1d2e3f4a5b6
Revises: f2a3b4c5d6e7
Create Date: 2026-05-28

"""
from alembic import op

revision = "c1d2e3f4a5b6"
down_revision = "f2a3b4c5d6e7"
branch_labels = None
depends_on = None


def upgrade():
    # Remove duplicate rows first — keep the oldest (lowest id) for each URL.
    op.execute("""
        DELETE FROM news
        WHERE id NOT IN (
            SELECT MIN(id)
            FROM news
            WHERE url IS NOT NULL
            GROUP BY url
        )
        AND url IS NOT NULL
    """)
    op.create_index("idx_news_url", "news", ["url"], unique=True)


def downgrade():
    op.drop_index("idx_news_url", table_name="news")
