"""Alembic environment — wired to app models and settings."""

import sys
from pathlib import Path
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Make `app` importable from alembic context
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.core.db import Base

# Register all ORM models so Base.metadata is fully populated
def _register_models() -> None:
    from app.modules.analytics import models as _  # noqa: F401
    from app.modules.config import models as _  # noqa: F401
    from app.modules.market import models as _  # noqa: F401
    from app.modules.news import models as _  # noqa: F401
    from app.modules.notification import models as _  # noqa: F401
    from app.modules.portfolio import models as _  # noqa: F401
    from app.modules.recommendations import models as _  # noqa: F401
    from app.modules.signals import models as _  # noqa: F401
    from app.modules.users import models as _  # noqa: F401
    from app.modules.watchlist import models as _  # noqa: F401
    from app.modules.auth import models as _auth  # noqa: F401

_register_models()

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Override sqlalchemy.url with live settings value
config.set_main_option("sqlalchemy.url", settings.database_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    from sqlalchemy import create_engine
    connectable = create_engine(
        settings.database_url,
        poolclass=pool.NullPool,
        connect_args={"connect_timeout": 10, "application_name": "aureon-alembic"},
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
