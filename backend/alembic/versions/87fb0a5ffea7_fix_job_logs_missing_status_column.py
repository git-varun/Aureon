"""fix_job_logs_missing_status_column

Revision ID: 87fb0a5ffea7
Revises: b4c5d6e7f8a9
Create Date: 2026-07-02 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision: str = '87fb0a5ffea7'
down_revision: Union[str, None] = 'b4c5d6e7f8a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

job_status_enum = sa.Enum('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', name='jobstatus')


def _has_column(table: str, column: str, schema: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    return column in [c['name'] for c in inspector.get_columns(table, schema=schema)]


def upgrade() -> None:
    # config.job_logs was originally created with `status VARCHAR(20)`, but the ORM model
    # (app.domain.entities.config.JobLog) declares `status` as a native `jobstatus` enum.
    # Since the table already existed when the original migration ran, its guarded
    # create_table was a no-op and the column mismatch was never corrected.
    if not _has_column('job_logs', 'status', schema='config'):
        job_status_enum.create(op.get_bind(), checkfirst=True)
        op.add_column(
            'job_logs',
            sa.Column('status', job_status_enum, nullable=False, server_default='PENDING'),
            schema='config'
        )
        op.alter_column('job_logs', 'status', server_default=None, schema='config')


def downgrade() -> None:
    if _has_column('job_logs', 'status', schema='config'):
        op.drop_column('job_logs', 'status', schema='config')
