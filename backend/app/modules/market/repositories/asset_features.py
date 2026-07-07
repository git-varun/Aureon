from app.core.repositories.base import BaseRepository
import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.modules.market.entities.market import AssetFeatures


class AssetFeaturesRepository(BaseRepository):
    def __init__(self, session: Session):
        self.session = session

    def get(self, asset_id: uuid.UUID) -> AssetFeatures | None:
        stmt = select(AssetFeatures).where(AssetFeatures.asset_id == asset_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def upsert(self, features: AssetFeatures) -> AssetFeatures:
        stmt = insert(AssetFeatures).values(
            asset_id=features.asset_id,
            price=features.price,
            market_cap=features.market_cap,
            momentum_score=features.momentum_score,
            volatility_score=features.volatility_score,
            sentiment_score=features.sentiment_score,
            updated_at=features.updated_at
        )
        upsert_stmt = stmt.on_conflict_do_update(
            index_elements=['asset_id'],
            set_=dict(
                price=stmt.excluded.price,
                market_cap=stmt.excluded.market_cap,
                momentum_score=stmt.excluded.momentum_score,
                volatility_score=stmt.excluded.volatility_score,
                sentiment_score=stmt.excluded.sentiment_score,
                updated_at=stmt.excluded.updated_at
            )
        ).returning(AssetFeatures)

        result = self.session.execute(upsert_stmt).scalar_one()
        self.session.flush()
        return result
