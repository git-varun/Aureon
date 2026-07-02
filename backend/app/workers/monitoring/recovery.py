import uuid
from datetime import datetime, timezone

from app.core.database import SessionLocal, engine
from app.domain.entities.system import FailedIngestion


def retry_failed_ingestion(ingestion_id: uuid.UUID) -> None:
    with SessionLocal() as session:
        query = session.query(FailedIngestion).filter_by(id=ingestion_id)
        if engine.dialect.name != 'sqlite':
            query = query.with_for_update(skip_locked=True)
        ingestion = query.first()
        if not ingestion or ingestion.is_exhausted:
            return

        now = datetime.now(timezone.utc)
        backoffs = {1: 30, 2: 120, 3: 600, 4: 1800}

        if ingestion.attempts >= 4:
            ingestion.is_exhausted = True
            session.commit()
            return

        wait_time = backoffs.get(ingestion.attempts, 1800)
        updated_at = ingestion.updated_at
        if updated_at.tzinfo is None:
            updated_at = updated_at.replace(tzinfo=timezone.utc)

        time_since_last = (now - updated_at).total_seconds()

        if time_since_last < wait_time:
            return

        try:
            ingestion.attempts += 1
            ingestion.updated_at = now
            if ingestion.attempts >= 4:
                ingestion.is_exhausted = True
            session.commit()
        except Exception:
            session.rollback()
