import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.repositories.base import BaseRepository
from app.modules.news.entities.news import AssetSentimentSnapshot


class AssetSentimentSnapshotRepository(BaseRepository):
    def __init__(self, session: Session):
        self.session = session

    def get_latest(self, asset_id: uuid.UUID) -> AssetSentimentSnapshot | None:
        stmt = (
            select(AssetSentimentSnapshot)
            .where(AssetSentimentSnapshot.asset_id == asset_id)
            .order_by(AssetSentimentSnapshot.snapshot_date.desc())
            .limit(1)
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def upsert(self, snapshot: AssetSentimentSnapshot) -> AssetSentimentSnapshot:
        stmt = insert(AssetSentimentSnapshot).values(
            asset_id=snapshot.asset_id,
            snapshot_date=snapshot.snapshot_date,
            avg_sentiment_7d=snapshot.avg_sentiment_7d,
            avg_sentiment_30d=snapshot.avg_sentiment_30d,
            article_count_7d=snapshot.article_count_7d,
            trend=snapshot.trend,
        )
        upsert_stmt = stmt.on_conflict_do_update(
            index_elements=["asset_id", "snapshot_date"],
            set_=dict(
                avg_sentiment_7d=stmt.excluded.avg_sentiment_7d,
                avg_sentiment_30d=stmt.excluded.avg_sentiment_30d,
                article_count_7d=stmt.excluded.article_count_7d,
                trend=stmt.excluded.trend,
            ),
        )
        self.session.execute(upsert_stmt)
        self.session.flush()
        return snapshot
