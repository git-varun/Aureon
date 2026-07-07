from app.core.repositories.base import BaseRepository
from sqlalchemy.orm import Session

from app.modules.market.entities.evaluation import FeatureSnapshot


class FeatureSnapshotsRepository(BaseRepository):
    def __init__(self, session: Session):
        self.session = session

    def insert(self, snapshot: FeatureSnapshot) -> FeatureSnapshot:
        self.session.add(snapshot)
        self.session.flush()
        return snapshot
