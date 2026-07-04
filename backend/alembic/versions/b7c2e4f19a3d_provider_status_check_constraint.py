"""add check constraint for provider_configs.status against ProviderStatus enum

Revision ID: b7c2e4f19a3d
Revises: 4152b08a894f
Create Date: 2026-07-04 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = 'b7c2e4f19a3d'
down_revision: Union[str, None] = '4152b08a894f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Must stay in sync with app.core.providers.lifecycle.ProviderStatus. Adding a new
# lifecycle value requires a follow-up migration to widen this constraint.
_VALID_STATUSES = ("PLANNED", "STUB", "PARTIAL", "ACTIVE", "DISABLED", "DEPRECATED", "FAILED")


def upgrade() -> None:
    # Naming convention (see app.domain.entities.base.NAMING_CONVENTION) expands
    # this to "ck_provider_configs_status_valid" — pass the bare label, not the
    # already-prefixed name.
    op.create_check_constraint(
        'status_valid',
        'provider_configs',
        sa.text("status IN ('" + "', '".join(_VALID_STATUSES) + "')"),
        schema='config',
    )


def downgrade() -> None:
    op.drop_constraint('ck_provider_configs_status_valid', 'provider_configs', schema='config', type_='check')
