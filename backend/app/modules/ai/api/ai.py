import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.dependencies import (
    get_ai_service,
    get_config_service,
    get_current_user,
    get_user_context,
)
from app.core.database import get_db
from app.core.entities.system import User
from app.core.exceptions import NotFoundError, ValidationError
from app.core.services.config import ConfigService
from app.modules.ai.services.ai import AIService

router = APIRouter()

class AskAureonRequest(BaseModel):
    context_type: str  # "signal" or "recommendation"
    context_id: uuid.UUID
    question: str

class AIFeedbackRequest(BaseModel):
    generation_id: uuid.UUID
    rating: int  # 1 (thumbs up) or -1 (thumbs down)
    comment: Optional[str] = None

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
        response, generation_id = ai_service.ask_aureon(req.context_type, req.context_id, req.question, user_id=current_user.id)
        return {"response": response, "generation_id": str(generation_id)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/ai/feedback")
def submit_ai_feedback(
    req: AIFeedbackRequest,
    current_user: User = Depends(get_current_user),
    ai_service: AIService = Depends(get_ai_service)
):
    try:
        feedback = ai_service.submit_feedback(req.generation_id, req.rating, req.comment, user_id=current_user.id)
        return {"id": str(feedback.id), "generation_id": str(feedback.generation_id), "rating": feedback.rating}
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e.message)) from e
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e.message)) from e

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

@router.get("/analytics/ai/usage")
def get_ai_usage(
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    ai_service: AIService = Depends(get_ai_service),
):
    get_user_context(db, user)
    return ai_service.get_usage_summary(since, until)

@router.post("/analytics/ai/news/batch")
def analyze_news_batch(
    config_svc: ConfigService = Depends(get_config_service),
):
    task_id = config_svc.dispatch_job("fetch_news")
    return {"status": "queued", "message": "News batch queued", "task_id": task_id}
