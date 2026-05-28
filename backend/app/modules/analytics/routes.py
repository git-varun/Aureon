import json

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
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


@router.get("/ai/briefings")
def ai_briefing_history(
    limit: int = 30,
    db: Session = Depends(get_session),
    current_user=Depends(require_auth),
):
    """Return the last N global AIBriefing rows for the authenticated user."""
    from app.modules.analytics.models import AIBriefing

    rows = (
        db.query(AIBriefing)
        .filter(AIBriefing.briefing_type == "global")
        .order_by(AIBriefing.created_at.desc())
        .limit(max(1, min(limit, 100)))
        .all()
    )
    result = []
    for row in rows:
        try:
            content = json.loads(row.content) if row.content else {}
        except Exception:
            content = {}
        fp = content.get("future_projections") or {}
        result.append({
            "id": row.id,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            # Global briefing keys (prompt returns market_vibe, macro_analysis, etc.)
            "summary":            content.get("market_vibe"),
            "macro_analysis":     content.get("macro_analysis"),
            "short_term_trend":   fp.get("estimated_30d_trend"),
            "risk_level":         fp.get("portfolio_risk_level"),
            "key_catalyst":       fp.get("catalyst_watch"),
            "confidence":         content.get("confidence_score"),
            "global_score":       content.get("global_score"),
            "recommended_action": None,  # per-asset; use directives array instead
            "directives":         content.get("directives", []),
        })
    return result


@router.get("/ai/theme/{theme_id}")
def ai_theme_take(theme_id: str, _user=Depends(require_auth)):
    """Return cached AI take for a theme."""
    ck = cache_key("ai", "theme", theme_id)
    cached = cache.get(ck)
    if cached:
        return {"status": "cached", "data": cached}
    return {"status": "no_data", "data": None}


@router.post("/ai/theme/{theme_id}")
def ai_theme_revaluate(theme_id: str, db: Session = Depends(get_session), _user=Depends(require_auth)):
    """Generate or refresh an AI take for a market theme."""
    from app.modules.market.services import get_theme_detail
    from app.modules.analytics.ai_service import build_ai_service
    from app.modules.portfolio.providers.credential_manager import CredentialManager

    ck = cache_key("ai", "theme", theme_id)
    theme = get_theme_detail(theme_id)
    if not theme:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Theme not found")

    try:
        ai = build_ai_service(CredentialManager(db))
        ctx = (
            f"Investment theme: {theme['name']}\n"
            f"Description: {theme.get('desc', '')}\n"
            f"1-month return: {theme.get('ret1m', 0) * 100:.1f}%\n"
            f"Constituents: {', '.join(c['sym'] for c in theme.get('constituents', []))}\n"
        )
        result = ai.analyze_single_asset(ctx)
        if result:
            cache.set(ck, result, ttl=7200)
            return {"status": "cached", "data": result}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"AI service unavailable: {exc}")

    return {"status": "processing"}


class ThemeChatRequest(BaseModel):
    message: str = ""


@router.post("/ai/theme/{theme_id}/chat")
def ai_theme_chat(theme_id: str, body: ThemeChatRequest = Body(default=ThemeChatRequest()), db: Session = Depends(get_session), _user=Depends(require_auth)):
    """Answer a free-form question about a theme."""
    from app.modules.market.services import get_theme_detail
    from app.modules.analytics.ai_service import build_ai_service
    from app.modules.portfolio.providers.credential_manager import CredentialManager

    message = body.message.strip()
    if not message:
        return {"reply": "Please ask a question."}

    theme = get_theme_detail(theme_id)
    if not theme:
        raise HTTPException(status_code=404, detail="Theme not found")

    try:
        ai = build_ai_service(CredentialManager(db))
        ctx = (
            f"You are Aureon, a concise AI wealth advisor. Respond in 2-3 sentences max.\n"
            f"Investment theme: {theme['name']}\nDescription: {theme.get('desc', '')}\n"
            f"1-month return: {theme.get('ret1m', 0) * 100:.1f}%\n"
            f"Constituents: {', '.join(c['sym'] for c in theme.get('constituents', []))}\n"
            f"User question: {message}"
        )
        result = ai.analyze_single_asset(ctx)
        reply = (result or {}).get("take") or (result or {}).get("summary") or "Unable to generate a response at this time."
        return {"reply": reply}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"AI service unavailable: {exc}")


@router.post("/ai/news/batch")
def ai_news_sentiment_batch(_user=Depends(require_auth)):
    """Enqueue sentiment scoring for unscored news articles."""
    from app.tasks.ai import news_sentiment_task

    task = news_sentiment_task.delay()
    return {"status": "enqueued", "task_id": task.id}
