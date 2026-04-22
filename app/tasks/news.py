"""Celery task: fetch and store news from multiple providers."""

import logging

from app.core.celery_app import celery_app
from app.core.db import SessionLocal

logger = logging.getLogger("celery.news")


@celery_app.task(bind=True, name="news.fetch", max_retries=2)
def fetch_news_task(self, symbols=None):
    """
    Fetch news from all enabled providers and persist to database.

    Single entry point for news fetching. Called by:
    - Cron job: daily at 8 AM
    - Manual trigger: via admin/scheduler

    Args:
        symbols: Optional list of ticker strings. When None, uses all
                 portfolio symbols from Asset table.

    Returns:
        dict with status, symbols processed, and total new articles fetched.
    """
    try:
        from app.modules.news.services import NewsService
        from app.modules.portfolio.models import Asset
        from app.shared.constants import AssetType
        from app.shared.utils import extract_crypto_base_coin

        session = SessionLocal()
        service = NewsService(session)

        try:
            # Resolve symbol list: use provided or fetch from portfolio
            if symbols is None:
                assets = session.query(Asset).all()
                raw_symbols = [(a.symbol, a.asset_type) for a in assets]
            else:
                # Caller-supplied list: no asset_type info, treat all as equity
                raw_symbols = [(s, None) for s in symbols]

            if not raw_symbols:
                logger.warning("fetch_news_task: no symbols to process")
                session.close()
                return {"status": "success", "symbols": [], "total_fetched": 0}

            # Resolve effective query symbol per asset:
            # - crypto  → base coin (BTC-USD-EARN-FLEX → BTC), deduplicated
            # - equity  → symbol as-is
            seen_query_symbols: set = set()
            symbols_list = []  # (query_symbol, is_crypto)
            for sym, atype in raw_symbols:
                if atype == AssetType.CRYPTO:
                    base = extract_crypto_base_coin(sym)
                    if base in seen_query_symbols:
                        logger.debug("fetch_news_task: dedup crypto base=%s (from %s)", base, sym)
                        continue
                    seen_query_symbols.add(base)
                    symbols_list.append((base, True))
                else:
                    if sym not in seen_query_symbols:
                        seen_query_symbols.add(sym)
                        symbols_list.append((sym, False))

            logger.info("fetch_news_task: processing %d effective symbols (from %d assets)",
                        len(symbols_list), len(raw_symbols))

            total_fetched = 0
            failed_symbols = []

            for symbol, is_crypto in symbols_list:
                try:
                    count = service.fetch_and_store(symbol, session, is_crypto=is_crypto)
                    total_fetched += count
                    logger.info("fetch_news_task: symbol=%s fetched %d new articles", symbol, count)

                except Exception as exc:
                    logger.error(
                        "fetch_news_task: symbol=%s failed: %s",
                        symbol,
                        exc,
                    )
                    failed_symbols.append(symbol)

            logger.info(
                "fetch_news_task: complete — processed %d symbols, "
                "%d new articles, %d failed",
                len(symbols_list),
                total_fetched,
                len(failed_symbols),
            )

            return {
                "status": "success",
                "symbols_processed": len(symbols_list),
                "assets_total": len(raw_symbols),
                "total_fetched": total_fetched,
                "failed": failed_symbols,
            }

        finally:
            session.close()

    except Exception as exc:
        logger.exception("fetch_news_task failed: %s", exc)
        raise self.retry(exc=exc, countdown=60)
