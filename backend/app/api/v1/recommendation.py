import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.dependencies import (
    get_current_user,
    get_members_repo,
    get_recommendation_service,
)
from app.core.exceptions import NotFoundError, ValidationError
from app.domain.entities.system import User
from app.domain.services import RecommendationService
from app.infrastructure.repositories import OrganizationMembersRepository

router = APIRouter()

# --- Authorization Helpers ---

def check_org_write_access(org_id: uuid.UUID, user_id: uuid.UUID, members_repo: OrganizationMembersRepository):
    membership = members_repo.get_by_org_and_user(org_id, user_id)
    if not membership:
        raise HTTPException(status_code=403, detail="Not authorized to access this organization")
    if membership.role == "READ_ONLY":
        raise HTTPException(status_code=403, detail="Read-only members cannot modify resources")
    return membership

def check_org_read_access(org_id: uuid.UUID, user_id: uuid.UUID, members_repo: OrganizationMembersRepository):
    membership = members_repo.get_by_org_and_user(org_id, user_id)
    if not membership:
        raise HTTPException(status_code=403, detail="Not authorized to access this organization")
    return membership

# --- Recommendation Endpoints ---

@router.post("/organizations/{org_id}/recommendations/generate", status_code=status.HTTP_201_CREATED)
def generate_recommendations(
    org_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    service: RecommendationService = Depends(get_recommendation_service),
):
    check_org_write_access(org_id, current_user.id, members_repo)
    return service.generate_recommendations(org_id)

@router.get("/organizations/{org_id}/recommendations")
def list_recommendations(
    org_id: uuid.UUID,
    status: Optional[str] = Query(None, description="Filter by status (active, applied, dismissed)"),
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    service: RecommendationService = Depends(get_recommendation_service),
):
    check_org_read_access(org_id, current_user.id, members_repo)
    return service.get_recommendations(org_id, status=status)

@router.post("/organizations/{org_id}/recommendations/{recommendation_id}/apply")
def apply_recommendation(
    org_id: uuid.UUID,
    recommendation_id: uuid.UUID,
    portfolio_id: Optional[uuid.UUID] = Query(None, description="Target portfolio to apply transaction"),
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    service: RecommendationService = Depends(get_recommendation_service),
):
    check_org_write_access(org_id, current_user.id, members_repo)
    try:
        return service.apply_recommendation(recommendation_id, portfolio_id=portfolio_id, actor_id=current_user.id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/organizations/{org_id}/recommendations/{recommendation_id}/dismiss")
def dismiss_recommendation(
    org_id: uuid.UUID,
    recommendation_id: uuid.UUID,
    reason: Optional[str] = Query(None, description="Dismissal reasoning"),
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    service: RecommendationService = Depends(get_recommendation_service),
):
    check_org_write_access(org_id, current_user.id, members_repo)
    try:
        return service.dismiss_recommendation(recommendation_id, reason=reason, actor_id=current_user.id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/organizations/{org_id}/recommendations/{recommendation_id}/undo")
def undo_recommendation(
    org_id: uuid.UUID,
    recommendation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    members_repo: OrganizationMembersRepository = Depends(get_members_repo),
    service: RecommendationService = Depends(get_recommendation_service),
):
    check_org_write_access(org_id, current_user.id, members_repo)
    try:
        return service.undo_recommendation(recommendation_id, actor_id=current_user.id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
