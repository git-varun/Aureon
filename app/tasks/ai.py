"""Celery tasks for AI briefings and news sentiment scoring."""

import json
import logging

from app.core.cache import cache
from app.core.celery_app import celery_app
from app.core.db import SessionLocal
from app.modules.portfolio.providers.credential_manager import CredentialManager
from app.shared.utils import cache_key

logger = logging.getLogger("celery.ai")

_TTL_GLOBAL = 21600   # 6 hours
_TTL_SINGLE = 7200    # 2 hours


# ---------------------------------------------------------------------------
# Global portfolio briefing
# ---------------------------------------------------------------------------

@celery_app.task(bind=True, name="ai.global_briefing", max_retries=2)
def global_briefing_task(self):
    """Build a global portfolio briefing via the multi-provider AI chain and cache it."""
    ck = cache_key("ai", "briefing")
    try:
        cached = cache.get(ck)
        if cached:
            logger.info("global_briefing_task: cache hit")
            return cached

        from app.modules.analytics.context_builder import PortfolioContextBuilder
        from app.modules.analytics.ai_service import build_ai_service
        from app.modules.analytics.models import AIBriefing

        db = SessionLocal()
        try:
            context = PortfolioContextBuilder().build_global_context(db)
            service = build_ai_service(CredentialManager(db))
            result = service.analyze_briefing(context)

            briefing = AIBriefing(
                briefing_type="global",
                symbol=None,
                content=json.dumps(result),
                model_used=type(service).__name__,
            )
            db.add(briefing)
            db.commit()
        finally:
            db.close()

        cache.set(ck, result, ttl=_TTL_GLOBAL)
        logger.info("global_briefing_task: completed and cached")
        return result

    except Exception as exc:
        logger.exception("global_briefing_task failed: %s", exc)
        raise self.retry(exc=exc, countdown=30)


# ---------------------------------------------------------------------------
# Single-asset briefing
# ---------------------------------------------------------------------------

@celery_app.task(bind=True, name="ai.single_briefing", max_retries=2)
def single_asset_briefing_task(self, symbol: str):
    """Build an AI signal/rationale for a single asset and cache it."""
    ck = cache_key("ai", "single", symbol)
    try:
        cached = cache.get(ck)
        if cached:
            logger.info("single_asset_briefing_task: cache hit for %s", symbol)
            return cached

        from app.modules.analytics.context_builder import PortfolioContextBuilder
        from app.modules.analytics.ai_service import build_ai_service
        from app.modules.analytics.models import AIBriefing

        db = SessionLocal()
        try:
            context = PortfolioContextBuilder().build_single_context(symbol, db)
            service = build_ai_service(CredentialManager(db))
            result = service.analyze_single_asset(context)

            briefing = AIBriefing(
                briefing_type="single",
                symbol=symbol,
                content=json.dumps(result),
                model_used=type(service).__name__,
            )
            db.add(briefing)
            db.commit()
        finally:
            db.close()

        cache.set(ck, result, ttl=_TTL_SINGLE)
        logger.info("single_asset_briefing_task: completed for %s", symbol)
        return result

    except Exception as exc:
        logger.exception("single_asset_briefing_task failed for %s: %s", symbol, exc)
        raise self.retry(exc=exc, countdown=30)


# ---------------------------------------------------------------------------
# News sentiment batch
# ---------------------------------------------------------------------------

@celery_app.task(bind=True, name="ai.news_sentiment", max_retries=1)
def news_sentiment_task(self):
    """Score sentiment for News records that have no sentiment_score yet."""
    try:
        from app.modules.news.models import News
        from app.modules.analytics.ai_service import build_ai_service

        db = SessionLocal()
        try:
            unscoreds = (
                db.query(News)
                .filter(News.sentiment_score.is_(None))
                .order_by(News.published_at.desc())
                .limit(20)
                .all()
            )

            if not unscoreds:
                logger.info("news_sentiment_task: no unscored articles")
                return {"status": "success", "processed": 0}

            articles = [
                {
                    "url": n.url or "",
                    "title": n.title,
                    "content": n.content or n.summary or "",
                }
                for n in unscoreds
            ]

            service = build_ai_service(CredentialManager(db))
            response = service.analyze_news_batch(articles)

            sentiments_by_url = {}
            for item in response.get("article_sentiments", []):
                url = item.get("url", "")
                if url:
                    sentiments_by_url[url] = item.get("sentiment")

            processed = 0
            for news in unscoreds:
                score = sentiments_by_url.get(news.url or "")
                if score is not None:
                    news.sentiment_score = float(score)
                    processed += 1

            db.commit()
            logger.info("news_sentiment_task: scored %d articles", processed)
            return {"status": "success", "processed": processed}

        finally:
            db.close()

    except Exception as exc:
        logger.exception("news_sentiment_task failed: %s", exc)
        raise self.retry(exc=exc, countdown=60)
