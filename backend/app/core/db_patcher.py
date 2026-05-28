"""db_patcher — retired.

All schema changes previously run here have been absorbed into Alembic revision
0002_absorb_db_patcher.py.  This file is kept as a no-op stub so any import
references in existing code do not break at startup.
"""


def run_patches(engine) -> None:  # noqa: ARG001
    """No-op — patches are now managed by Alembic revision 0002."""
