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

        service = NewsService()
        session = SessionLocal()

        try:
            # Resolve symbol list: use provided or fetch from portfolio
            if symbols is None:
                assets = session.query(Asset.symbol).all()
                symbols_list = [row.symbol for row in assets]
            else:
                symbols_list = list(symbols)

            if not symbols_list:
                logger.warning("fetch_news_task: no symbols to process")
                session.close()
                return {"status": "success", "symbols": [], "total_fetched": 0}

            logger.info("fetch_news_task: processing %d symbols", len(symbols_list))

            total_fetched = 0
            failed_symbols = []

            for symbol in symbols_list:
                try:
                    count = service.fetch_and_store(symbol, session)
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
                "total_fetched": total_fetched,
                "failed": failed_symbols,
            }

        finally:
            session.close()

    except Exception as exc:
        logger.exception("fetch_news_task failed: %s", exc)
        raise self.retry(exc=exc, countdown=60)
