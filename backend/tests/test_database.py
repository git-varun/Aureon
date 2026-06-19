from sqlalchemy import text

from app.core.database import SessionLocal


def test_database_connectivity() -> None:
    db = SessionLocal()
    try:
        result = db.execute(text("SELECT 1"))
        assert result.scalar() == 1
    finally:
        db.close()
