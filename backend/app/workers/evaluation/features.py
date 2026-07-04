import uuid

from celery import shared_task

from app.core.database import SessionLocal
from app.core.redis import cache_asset_features


@shared_task(name="app.workers.evaluation.features.generate_features")
def generate_features(asset_id: str) -> None:
    from app.domain.services.evaluation import FeatureGenerationService
    from app.infrastructure.repositories.asset_features import AssetFeaturesRepository
    from app.infrastructure.repositories.asset_snapshot import AssetSnapshotRepository

    aid = uuid.UUID(asset_id) if isinstance(asset_id, str) else asset_id

    with SessionLocal() as session:
        cache_data = FeatureGenerationService(
            AssetFeaturesRepository(session),
            AssetSnapshotRepository(session),
        ).generate(aid)

    if cache_data:
        cache_asset_features(str(aid), cache_data)

    from app.workers.evaluation.signals import generate_signals
    generate_signals.delay(str(aid))
