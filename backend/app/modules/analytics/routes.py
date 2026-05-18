import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.cache import cache
from app.core.dependencies import require_auth, get_session
from app.shared.utils import cache_key

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/health")
def analytics_health():
    return {"module": "analytics", "status": "ok"}


# ---------------------------------------------------------------------------
# AI Briefing routes
# ---------------------------------------------------------------------------

@router.post("/ai/global")
def ai_global_briefing(_user=Depends(require_auth)):
    """Return a cached global portfolio briefing, or enqueue generation."""
    from app.tasks.ai import global_briefing_task

    ck = cache_key("ai", "briefing")
    cached = cache.get(ck)
    if cached:
        return {"status": "cached", "data": cached}

    try:
        task = global_briefing_task.delay()
        return {"status": "processing", "task_id": task.id}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"AI service unavailable: {exc}")


def _db_briefing(symbol: str, db: Session):
    """Fetch latest single AIBriefing from DB and return parsed content, or None."""
    from app.modules.analytics.models import AIBriefing
    row = (
        db.query(AIBriefing)
        .filter(AIBriefing.briefing_type == "single", AIBriefing.symbol == symbol)
        .order_by(AIBriefing.created_at.desc())
        .first()
    )
    if not row:
        return None
    try:
        return json.loads(row.content)
    except Exception:
        return None


@router.get("/ai/single/{symbol}")
def ai_single_briefing_cached(symbol: str, db: Session = Depends(get_session), _user=Depends(require_auth)):
    """Return the latest AI take for a symbol from cache, falling back to DB."""
    ck = cache_key("ai", "single", symbol)
    cached = cache.get(ck)
    if cached:
        return {"status": "cached", "data": cached}

    result = _db_briefing(symbol, db)
    if not result:
        return {"status": "no_data", "data": None}

    cache.set(ck, result, ttl=7200)
    return {"status": "cached", "data": result}


@router.post("/ai/single/{symbol}")
def ai_single_briefing(symbol: str, db: Session = Depends(get_session), _user=Depends(require_auth)):
    """Run or return a single-asset AI briefing."""
    from app.tasks.ai import single_asset_briefing_task

    ck = cache_key("ai", "single", symbol)
    cached = cache.get(ck)
    if cached:
        return {"status": "cached", "data": cached}

    try:
        single_asset_briefing_task.delay(symbol)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"AI service unavailable: {exc}")

    # Re-check cache in case task ran eagerly (no broker)
    cached = cache.get(ck)
    if cached:
        return {"status": "cached", "data": cached}

    # Task ran eagerly but cache is unavailable — read directly from DB
    result = _db_briefing(symbol, db)
    if result:
        return {"status": "cached", "data": result}

    return {"status": "processing"}


@router.post("/ai/news/batch")
def ai_news_sentiment_batch(_user=Depends(require_auth)):
    """Enqueue sentiment scoring for unscored news articles."""
    from app.tasks.ai import news_sentiment_task

    task = news_sentiment_task.delay()
    return {"status": "enqueued", "task_id": task.id}
