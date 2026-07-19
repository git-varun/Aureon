import os

os.environ["TESTING"] = "true"

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

# Individual test modules only import the entity classes they directly use,
# but SQLAlchemy resolves string-based ForeignKey targets (e.g. Transaction.
# recommendation_id -> "recommendation.recommendations.id") against whatever
# mapped classes have been imported anywhere in the process — so a test that
# never imports the ai/recommendation module can fail to configure mappers
# for an unrelated table. Import every entity module here, same list
# alembic/env.py already needs for autogenerate, so all tables are always
# registered regardless of which test runs first.
import app.core.entities.config  # noqa: F401
import app.core.entities.notification  # noqa: F401
import app.core.entities.system  # noqa: F401
import app.modules.ai.entities.ai  # noqa: F401
import app.modules.ai.entities.recommendation  # noqa: F401
import app.modules.market.entities.evaluation  # noqa: F401
import app.modules.market.entities.market  # noqa: F401
import app.modules.market.entities.watchlist  # noqa: F401
import app.modules.news.entities.news  # noqa: F401
import app.modules.portfolio.entities.portfolio  # noqa: F401


@pytest.fixture()
def db_session():
    engine = create_engine(settings.DATABASE_URL)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.rollback()
        session.close()
        engine.dispose()
