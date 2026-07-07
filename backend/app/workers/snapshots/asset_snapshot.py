import uuid

from celery import shared_task

from app.core.database import SessionLocal
from app.core.redis import cache_asset_snapshot


@shared_task(name="app.workers.snapshots.asset_snapshot.process_asset_snapshot")
def process_asset_snapshot(asset_id: str) -> None:
    from app.core.providers.factory import ProviderFactory
    from app.core.services.config import ConfigService
    from app.modules.market.services.snapshot import SnapshotService
    from app.modules.market.repositories.asset_snapshot import AssetSnapshotRepository
    from app.core.repositories.config import ConfigRepository
    from app.modules.market.repositories.market import MarketRepository

    aid = uuid.UUID(asset_id) if isinstance(asset_id, str) else asset_id

    with SessionLocal() as session:
        market_repo = MarketRepository(session)
        quote = market_repo.get_quote_by_asset_id(aid)
        symbol = quote.symbol if quote else None

        indicators: dict = {}
        if symbol:
            adapter = ProviderFactory(ConfigService(ConfigRepository(session))).get("yahoo")
            indicators = adapter.get_technical_indicators(symbol)

        cache_data = SnapshotService(AssetSnapshotRepository(session), market_repo).build_snapshot(aid, indicators)
        if cache_data:
            cache_asset_snapshot(str(aid), cache_data)

    from app.workers.evaluation.features import generate_features
    generate_features.delay(str(aid))
