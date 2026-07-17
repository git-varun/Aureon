"""drop job_configs cron_expression and next_run_at columns

Both are dead: cron_expression was never read to actually schedule
dispatch (Celery beat's schedule is the hardcoded dict in
celery_app.py, wholly independent of this column — see
JOBCONFIG_SCHEDULING_SCOPE.md), and next_run_at was never assigned
anywhere. The Settings UI now displays the real beat_schedule cadence
(ConfigService._schedule_display) instead of a separately-stored value
that could drift from what actually runs.

Revision ID: 2074319bf4b9
Revises: 9a7ae6e25211
Create Date: 2026-07-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2074319bf4b9'
down_revision: Union[str, None] = '9a7ae6e25211'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('job_configs', 'cron_expression', schema='config')
    op.drop_column('job_configs', 'next_run_at', schema='config')


def downgrade() -> None:
    op.add_column('job_configs', sa.Column('cron_expression', sa.String(length=64), nullable=False, server_default=''), schema='config')
    op.alter_column('job_configs', 'cron_expression', server_default=None, schema='config')
    op.add_column('job_configs', sa.Column('next_run_at', sa.DateTime(timezone=True), nullable=True), schema='config')
