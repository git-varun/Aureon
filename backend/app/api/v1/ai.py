import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.dependencies import get_ai_service, get_current_user, get_members_repo
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
