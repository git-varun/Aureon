import uuid

from celery import shared_task

from app.core.database import SessionLocal
from app.domain.services.recommendation import RecommendationService


@shared_task(name="app.workers.evaluation.scoring.generate_scores")
def generate_scores(asset_id: str) -> None:
    aid = uuid.UUID(asset_id) if isinstance(asset_id, str) else asset_id

    with SessionLocal() as session:
        scored = RecommendationService(session).generate_and_score_asset(aid)

    if scored:
        from app.workers.monitoring.asset_health import compute_asset_health
        compute_asset_health.delay(str(aid))
