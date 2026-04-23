"""SQLAlchemy ORM setup."""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.core.config import settings

engine = create_engine(settings.database_url, echo=False, pool_pre_ping=True, pool_size=5, max_overflow=2)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_session():
    """Dependency: get DB session."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()



