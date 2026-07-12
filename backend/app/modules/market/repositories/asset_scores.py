from app.core.repositories.base import BaseRepository
import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.modules.market.entities.evaluation import AssetScore


class AssetScoresRepository(BaseRepository):
    def __init__(self, session: Session):
        self.session = session

    def get(self, asset_id: uuid.UUID, model_version: str) -> AssetScore | None:
        stmt = select(AssetScore).where(
            AssetScore.asset_id == asset_id,
            AssetScore.model_version == model_version
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def upsert(self, score: AssetScore) -> AssetScore:
        stmt = insert(AssetScore).values(
            asset_id=score.asset_id,
            model_version=score.model_version,
            recommendation_score=score.recommendation_score,
            quality_score=score.quality_score,
            valuation_score=score.valuation_score,
            unavailable_inputs=score.unavailable_inputs,
            generated_at=score.generated_at
        )
        upsert_stmt = stmt.on_conflict_do_update(
            index_elements=['asset_id', 'model_version'],
            set_=dict(
                recommendation_score=stmt.excluded.recommendation_score,
                quality_score=stmt.excluded.quality_score,
                valuation_score=stmt.excluded.valuation_score,
                unavailable_inputs=stmt.excluded.unavailable_inputs,
                generated_at=stmt.excluded.generated_at
            )
        ).returning(AssetScore)

        result = self.session.execute(upsert_stmt).scalar_one()
        self.session.flush()
        return result
