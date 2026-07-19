import uuid
from datetime import datetime

from app.core.repositories.base import BaseRepository
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.market.entities.evaluation import FeatureSnapshot


class FeatureSnapshotsRepository(BaseRepository):
    def __init__(self, session: Session):
        self.session = session

    def insert(self, snapshot: FeatureSnapshot) -> FeatureSnapshot:
        self.session.add(snapshot)
        self.session.flush()
        return snapshot

    def get_history(self, asset_id: uuid.UUID, since: datetime | None = None) -> list[FeatureSnapshot]:
        stmt = select(FeatureSnapshot).where(FeatureSnapshot.asset_id == asset_id)
        if since is not None:
            stmt = stmt.where(FeatureSnapshot.snapshot_at >= since)
        stmt = stmt.order_by(FeatureSnapshot.snapshot_at.desc())
        return list(self.session.execute(stmt).scalars().all())
