"""merge heads

Revision ID: 2a357bf3789e
Revises: a3b4c5d6e7f8, c1d2e3f4a5b6
Create Date: 2026-05-29 06:47:22.535340

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '2a357bf3789e'
down_revision: Union[str, None] = ('a3b4c5d6e7f8', 'c1d2e3f4a5b6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
