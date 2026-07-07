from app.core.repositories.base import BaseRepository
import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.modules.market.entities.market import AssetSnapshot


class AssetSnapshotRepository(BaseRepository):
    def __init__(self, session: Session):
        self.session = session

    def get(self, asset_id: uuid.UUID) -> AssetSnapshot | None:
        stmt = select(AssetSnapshot).where(AssetSnapshot.asset_id == asset_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def upsert(self, snapshot: AssetSnapshot) -> AssetSnapshot:
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        stmt = insert(AssetSnapshot).values(
            asset_id=snapshot.asset_id,
            price=snapshot.price,
            market_cap=snapshot.market_cap,
            pe_ratio=snapshot.pe_ratio,
            rsi=snapshot.rsi,
            momentum_score=snapshot.momentum_score,
            volatility_score=snapshot.volatility_score,
            sentiment_score=snapshot.sentiment_score,
            payload=snapshot.payload,
            created_at=now,
            updated_at=snapshot.updated_at,
        )
        upsert_stmt = stmt.on_conflict_do_update(
            index_elements=['asset_id'],
            set_=dict(
                price=stmt.excluded.price,
                market_cap=stmt.excluded.market_cap,
                pe_ratio=stmt.excluded.pe_ratio,
                rsi=stmt.excluded.rsi,
                momentum_score=stmt.excluded.momentum_score,
                volatility_score=stmt.excluded.volatility_score,
                sentiment_score=stmt.excluded.sentiment_score,
                payload=stmt.excluded.payload,
                updated_at=stmt.excluded.updated_at,
            )
        )
        self.session.execute(upsert_stmt)
        self.session.flush()
        return snapshot
