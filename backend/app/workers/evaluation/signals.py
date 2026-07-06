import uuid
from datetime import datetime, timezone

from celery import shared_task

from app.core.database import SessionLocal
from app.core.logging import logger
from app.core.redis import cache_asset_signals


@shared_task(name="app.workers.evaluation.signals.generate_signals")
def generate_signals(asset_id: str) -> None:
    from app.core.providers.factory import ProviderFactory
    from app.domain.services.config import ConfigService
    from app.infrastructure.repositories.config import ConfigRepository
    from app.infrastructure.repositories.market import MarketRepository

    aid = uuid.UUID(asset_id) if isinstance(asset_id, str) else asset_id

    with SessionLocal() as session:
        quote = MarketRepository(session).get_quote_by_asset_id(aid)
        if not quote:
            logger.warning(f"LatestQuote not found for asset: {aid}")
            return
        symbol = quote.symbol

        adapter = ProviderFactory(ConfigService(ConfigRepository(session))).get("yahoo")
        signals_dict = adapter.get_technical_indicators(symbol)

    signals_dict["asset_id"] = str(aid)
    signals_dict["symbol"] = symbol
    signals_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    cache_asset_signals(str(aid), signals_dict)

    from app.workers.evaluation.scoring import generate_scores
    generate_scores.delay(str(aid))
