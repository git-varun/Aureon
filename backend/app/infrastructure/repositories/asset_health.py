from app.infrastructure.repositories.base import BaseRepository
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.domain.entities.market import AssetHealth


class AssetHealthRepository(BaseRepository):
    def __init__(self, session: Session):
        self.session = session

    def upsert(self, health: AssetHealth) -> AssetHealth:
        stmt = insert(AssetHealth).values(
            asset_id=health.asset_id,
            provider_name=health.provider_name,
            last_successful_ingestion=health.last_successful_ingestion,
            quote_age_seconds=health.quote_age_seconds,
            fundamentals_age_seconds=health.fundamentals_age_seconds,
            signal_age_seconds=health.signal_age_seconds,
            news_age_seconds=health.news_age_seconds,
            status=health.status,
            updated_at=datetime.now(timezone.utc)
        )
        upsert_stmt = stmt.on_conflict_do_update(
            index_elements=['asset_id', 'provider_name'],
            set_=dict(
                last_successful_ingestion=stmt.excluded.last_successful_ingestion,
                quote_age_seconds=stmt.excluded.quote_age_seconds,
                fundamentals_age_seconds=stmt.excluded.fundamentals_age_seconds,
                signal_age_seconds=stmt.excluded.signal_age_seconds,
                news_age_seconds=stmt.excluded.news_age_seconds,
                status=stmt.excluded.status,
                updated_at=stmt.excluded.updated_at
            )
        ).returning(AssetHealth)

        result = self.session.execute(upsert_stmt).scalar_one()
        self.session.flush()
        return result

    def get(self, asset_id: uuid.UUID) -> list[AssetHealth]:
        stmt = select(AssetHealth).where(AssetHealth.asset_id == asset_id)
        return list(self.session.execute(stmt).scalars().all())
