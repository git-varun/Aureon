from fastapi import APIRouter

from app.core.cache import cache
from app.shared.utils import cache_key

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/health")
def analytics_health():
    return {"module": "analytics", "status": "ok"}


# ---------------------------------------------------------------------------
# AI Briefing routes
# ---------------------------------------------------------------------------

@router.post("/ai/global")
def ai_global_briefing():
    """Return a cached global portfolio briefing, or enqueue generation."""
    from app.tasks.ai import global_briefing_task

    ck = cache_key("ai", "briefing")
    cached = cache.get(ck)
    if cached:
        return {"status": "cached", "data": cached}

    task = global_briefing_task.delay()
    return {"status": "processing", "task_id": task.id}


@router.post("/ai/single/{symbol}")
def ai_single_briefing(symbol: str):
    """Return a cached single-asset briefing, or enqueue generation."""
    from app.tasks.ai import single_asset_briefing_task

    ck = cache_key("ai", "single", symbol)
    cached = cache.get(ck)
    if cached:
        return {"status": "cached", "data": cached}

    task = single_asset_briefing_task.delay(symbol)
    return {"status": "processing", "task_id": task.id}


@router.post("/ai/news/batch")
def ai_news_sentiment_batch():
    """Enqueue sentiment scoring for unscored news articles."""
    from app.tasks.ai import news_sentiment_task

    task = news_sentiment_task.delay()
    return {"status": "enqueued", "task_id": task.id}
