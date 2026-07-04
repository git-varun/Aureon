import uuid

from app.core.database import SessionLocal
from app.domain.services.recommendation import RecommendationService


def generate_scores(asset_id: uuid.UUID) -> None:
    with SessionLocal() as session:
        scored = RecommendationService(session).generate_and_score_asset(asset_id)

    if scored:
        from app.workers.monitoring.asset_health import compute_asset_health
        compute_asset_health(asset_id)
