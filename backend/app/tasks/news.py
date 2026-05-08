"""Celery tasks: fetch/store news and aggregate asset sentiment."""

import logging
from datetime import date, datetime, timedelta, timezone

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


@celery_app.task(name="news.aggregate_sentiment")
def aggregate_sentiment_task():
    """Aggregate scored news sentiment per asset and upsert AssetSentimentSnapshot.

    Groups news via news_assets junction (not symbols string).
    Computes 7-day and 30-day average sentiment scores and derives trend.
    Run nightly at 22:00 IST.
    """
    session = None
    try:
        from app.modules.news.models import News, NewsAsset
        from app.modules.news.models import AssetSentimentSnapshot
        from app.modules.portfolio.models import Asset
        from sqlalchemy import func

        session = SessionLocal()
        now = datetime.now(timezone.utc)
        today = now.date()
        cutoff_7d = now - timedelta(days=7)
        cutoff_30d = now - timedelta(days=30)

        # Fetch all assets that have at least one linked news article
        asset_ids = [
            row[0] for row in session.query(NewsAsset.asset_id).distinct().all()
        ]
        if not asset_ids:
            logger.info("aggregate_sentiment_task: no linked news_assets rows found")
            return {"status": "success", "snapshots": 0}

        snapshots_written = 0
        for asset_id in asset_ids:
            try:
                # All scored news linked to this asset in the last 30 days
                linked_news = (
                    session.query(News)
                    .join(NewsAsset, NewsAsset.news_id == News.id)
                    .filter(
                        NewsAsset.asset_id == asset_id,
                        News.sentiment_score.isnot(None),
                        News.published_at >= cutoff_30d,
                    )
                    .all()
                )

                scores_7d = [
                    n.sentiment_score for n in linked_news
                    if n.published_at and n.published_at.replace(tzinfo=timezone.utc) >= cutoff_7d
                ]
                scores_30d = [n.sentiment_score for n in linked_news]

                avg_7d = round(sum(scores_7d) / len(scores_7d), 4) if scores_7d else None
                avg_30d = round(sum(scores_30d) / len(scores_30d), 4) if scores_30d else None

                # Trend: compare 7d avg against 30d avg
                trend = "STABLE"
                if avg_7d is not None and avg_30d is not None:
                    diff = avg_7d - avg_30d
                    if diff > 0.05:
                        trend = "IMPROVING"
                    elif diff < -0.05:
                        trend = "DETERIORATING"

                # Upsert snapshot (unique on asset_id + snapshot_date)
                snapshot = (
                    session.query(AssetSentimentSnapshot)
                    .filter_by(asset_id=asset_id, snapshot_date=today)
                    .first()
                )
                if snapshot:
                    snapshot.avg_sentiment_7d = avg_7d
                    snapshot.avg_sentiment_30d = avg_30d
                    snapshot.article_count_7d = len(scores_7d)
                    snapshot.trend = trend
                    snapshot.computed_at = now
                else:
                    session.add(AssetSentimentSnapshot(
                        asset_id=asset_id,
                        snapshot_date=today,
                        avg_sentiment_7d=avg_7d,
                        avg_sentiment_30d=avg_30d,
                        article_count_7d=len(scores_7d),
                        trend=trend,
                        computed_at=now,
                    ))
                snapshots_written += 1

            except Exception as exc:
                logger.warning("aggregate_sentiment_task: failed for asset_id=%s: %s", asset_id, exc)
                session.rollback()

        session.commit()
        logger.info("aggregate_sentiment_task: wrote %d snapshots", snapshots_written)
        return {"status": "success", "snapshots": snapshots_written}

    except Exception as exc:
        logger.exception("aggregate_sentiment_task failed: %s", exc)
        raise
    finally:
        if session:
            session.close()
