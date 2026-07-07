import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.dependencies import (
    get_ai_service,
    get_current_user,
    get_db,
    get_user_context,
)
from app.core.entities.system import User
from app.modules.ai.services.ai import AIService

router = APIRouter()

class AskAureonRequest(BaseModel):
    context_type: str  # "signal" or "recommendation"
    context_id: uuid.UUID
    question: str

@router.post("/ai/global")
def generate_global_briefing(
    current_user: User = Depends(get_current_user),
    ai_service: AIService = Depends(get_ai_service)
):
    try:
        return ai_service.generate_briefing("global", user_id=current_user.id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/ai/weekly")
def generate_weekly_briefing(
    current_user: User = Depends(get_current_user),
    ai_service: AIService = Depends(get_ai_service)
):
    try:
        return ai_service.generate_briefing("weekly", user_id=current_user.id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/ai/monthly")
def generate_monthly_briefing(
    current_user: User = Depends(get_current_user),
    ai_service: AIService = Depends(get_ai_service)
):
    try:
        return ai_service.generate_briefing("monthly", user_id=current_user.id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/ai/qa")
def ask_aureon(
    req: AskAureonRequest,
    current_user: User = Depends(get_current_user),
    ai_service: AIService = Depends(get_ai_service)
):
    try:
        response = ai_service.ask_aureon(req.context_type, req.context_id, req.question, user_id=current_user.id)
        return {"response": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/ai/recommendations/{recommendation_id}/explain")
def explain_recommendation(
    recommendation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    ai_service: AIService = Depends(get_ai_service)
):
    try:
        return ai_service.explain_recommendation(recommendation_id, user_id=current_user.id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Bare analytics endpoints, single-user facade via get_user_context ---

@router.get("/analytics/ai/briefings")
def fetch_briefing_history(
    limit: int = Query(30),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    ai_service: AIService = Depends(get_ai_service),
):
    get_user_context(db, user)
    return ai_service.get_briefing_history(limit=limit)

@router.get("/analytics/ai/single/{symbol}")
@router.post("/analytics/ai/single/{symbol}")
def get_ai_take(
    symbol: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    ai_service: AIService = Depends(get_ai_service)
):
    get_user_context(db, user)  # ensures default Portfolio exists
    return ai_service.get_single_asset_take(symbol, user_id=user.id)

@router.post("/analytics/ai/news/batch")
def analyze_news_batch():
    return {"status": "success", "message": "News batch processed"}
