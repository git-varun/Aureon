import uuid

from celery import shared_task

from app.core.database import SessionLocal
from app.core.redis import cache_asset_features


@shared_task(name="app.workers.evaluation.features.generate_features")
def generate_features(asset_id: str) -> None:
    from app.modules.ai.services.evaluation import FeatureGenerationService
    from app.modules.market.repositories.asset_features import AssetFeaturesRepository
    from app.modules.market.repositories.asset_snapshot import AssetSnapshotRepository
    from app.modules.news.repositories.asset_sentiment import AssetSentimentSnapshotRepository
    from app.modules.news.repositories.news import NewsRepository
    from app.modules.news.services.sentiment import NewsSentimentService

    aid = uuid.UUID(asset_id) if isinstance(asset_id, str) else asset_id

    with SessionLocal() as session:
        # Recompute the rolling sentiment aggregate on this same cadence
        # (per-article sentiment itself is computed once, at news ingestion).
        NewsSentimentService(
            NewsRepository(session),
            AssetSentimentSnapshotRepository(session),
        ).aggregate_asset_sentiment(aid)

        cache_data = FeatureGenerationService(
            AssetFeaturesRepository(session),
            AssetSnapshotRepository(session),
            AssetSentimentSnapshotRepository(session),
        ).generate(aid)

    if cache_data:
        cache_asset_features(str(aid), cache_data)

    from app.workers.evaluation.signals import generate_signals
    generate_signals.delay(str(aid))
