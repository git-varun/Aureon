import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from celery import shared_task

from app.core.database import SessionLocal
from app.core.exceptions import NotFoundError
from app.core.redis import cache_asset_signals


@shared_task(name="app.workers.evaluation.signals.generate_signals")
def generate_signals(asset_id: str, indicators: Optional[dict[str, Any]] = None) -> None:
    from app.core.providers.factory import ProviderFactory
    from app.core.services.config import ConfigService
    from app.core.repositories.config import ConfigRepository
    from app.modules.market.repositories.market import MarketRepository

    aid = uuid.UUID(asset_id) if isinstance(asset_id, str) else asset_id

    with SessionLocal() as session:
        quote = MarketRepository(session).get_quote_by_asset_id(aid)
        if not quote:
            raise NotFoundError(f"LatestQuote not found for asset: {aid}")
        symbol = quote.symbol

        # Reuse the indicators process_asset_snapshot already fetched for
        # this symbol moments earlier, when chained from it, instead of
        # making a second live get_technical_indicators call (see
        # EVALUATION_MODULE_AUDIT.md 2.4). Standalone callers (admin
        # reprocess/backfill/repair) pass none, so fetch here as before.
        if indicators is None:
            adapter = ProviderFactory(ConfigService(ConfigRepository(session))).get("yahoo")
            signals_dict = adapter.get_technical_indicators(symbol)
        else:
            signals_dict = dict(indicators)

    signals_dict["asset_id"] = str(aid)
    signals_dict["symbol"] = symbol
    signals_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    cache_asset_signals(str(aid), signals_dict)

    from app.workers.evaluation.scoring import generate_scores
    generate_scores.delay(str(aid))
