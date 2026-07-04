import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.dependencies import (
    get_ai_service,
    get_current_user,
    get_db,
    get_members_repo,
    get_user_context,
)
from app.api.v1.recommendation import check_org_read_access
from app.domain.entities.system import User
from app.domain.services.ai import AIService
from app.infrastructure.repositories import OrganizationMembersRepository

router = APIRouter()

class AskAureonRequest(BaseModel):
    context_type: str  # "signal" or "recommendation"
    context_id: uuid.UUID
    question: str

@router.post("/organizations/{org_id}/ai/global")
def generate_global_briefing(
    org_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    ai_service: AIService = Depends(get_ai_service)
):
    check_org_read_access(org_id, current_user.id, members_repo)
    try:
        return ai_service.generate_briefing(org_id, "global", user_id=current_user.id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/organizations/{org_id}/ai/weekly")
def generate_weekly_briefing(
    org_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    ai_service: AIService = Depends(get_ai_service)
):
    check_org_read_access(org_id, current_user.id, members_repo)
    try:
        return ai_service.generate_briefing(org_id, "weekly", user_id=current_user.id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/organizations/{org_id}/ai/monthly")
def generate_monthly_briefing(
    org_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    ai_service: AIService = Depends(get_ai_service)
):
    check_org_read_access(org_id, current_user.id, members_repo)
    try:
        return ai_service.generate_briefing(org_id, "monthly", user_id=current_user.id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/organizations/{org_id}/ai/qa")
def ask_aureon(
    org_id: uuid.UUID,
    req: AskAureonRequest,
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    ai_service: AIService = Depends(get_ai_service)
):
    check_org_read_access(org_id, current_user.id, members_repo)
    try:
        response = ai_service.ask_aureon(req.context_type, req.context_id, req.question, user_id=current_user.id)
        return {"response": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/organizations/{org_id}/ai/recommendations/{recommendation_id}/explain")
def explain_recommendation(
    org_id: uuid.UUID,
    recommendation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    ai_service: AIService = Depends(get_ai_service)
):
    check_org_read_access(org_id, current_user.id, members_repo)
    try:
        return ai_service.explain_recommendation(recommendation_id, user_id=current_user.id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Bare (non-org-scoped) analytics endpoints, single-user facade via get_user_context ---

@router.get("/analytics/ai/briefings")
def fetch_briefing_history(
    limit: int = Query(30),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    ai_service: AIService = Depends(get_ai_service),
):
    org_id, portfolio_id = get_user_context(db, user)
    return ai_service.get_briefing_history(org_id, limit=limit)

@router.get("/analytics/ai/single/{symbol}")
@router.post("/analytics/ai/single/{symbol}")
def get_ai_take(
    symbol: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    ai_service: AIService = Depends(get_ai_service)
):
    get_user_context(db, user)  # ensures Personal Org/Portfolio exist
    return ai_service.get_single_asset_take(symbol, user_id=user.id)

@router.post("/analytics/ai/news/batch")
def analyze_news_batch():
    return {"status": "success", "message": "News batch processed"}
