import uuid

from celery import shared_task

from app.core.database import SessionLocal
from app.core.redis import cache_asset_health


@shared_task(name="app.workers.monitoring.asset_health.compute_asset_health")
def compute_asset_health(asset_id: str) -> None:
    from app.modules.market.services.asset_health import AssetHealthService
    from app.modules.market.repositories.asset_fundamentals import AssetFundamentalsRepository
    from app.modules.market.repositories.asset_health import AssetHealthRepository
    from app.modules.market.repositories.market import MarketRepository

    aid = uuid.UUID(asset_id) if isinstance(asset_id, str) else asset_id

    with SessionLocal() as session:
        cache_data = AssetHealthService(
            AssetHealthRepository(session),
            MarketRepository(session),
            AssetFundamentalsRepository(session),
        ).compute(aid)

    cache_asset_health(str(aid), cache_data)
