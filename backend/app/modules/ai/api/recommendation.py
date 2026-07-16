import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies import (
    get_current_user,
    get_recommendation_service,
    get_user_context,
)
from app.core.database import get_db
from app.core.exceptions import NotFoundError, ValidationError
from app.core.entities.system import User
from app.modules.ai.services.recommendation import RecommendationService

router = APIRouter()

# Bare (non-/recommendation-prefixed) route, mounted separately at /api/v1
bare_router = APIRouter()

@bare_router.post("/aureon/recommendations/seed")
def seed_recommendations(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    get_user_context(db, user)
    service = RecommendationService(db)
    recs = service.generate_recommendations()
    for r in recs:
        r["ext_id"] = r["id"]
    return {"status": "success", "count": len(recs), "items": recs}

# --- Recommendation Endpoints ---

@router.post("/recommendations/generate", status_code=status.HTTP_201_CREATED)
def generate_recommendations(
    current_user: User = Depends(get_current_user),
    service: RecommendationService = Depends(get_recommendation_service),
):
    return service.generate_recommendations()

@router.get("/recommendations")
def list_recommendations(
    status: Optional[str] = Query(None, description="Filter by status (active, applied, dismissed)"),
    current_user: User = Depends(get_current_user),
    service: RecommendationService = Depends(get_recommendation_service),
):
    return service.get_recommendations(status=status)

@router.post("/recommendations/{recommendation_id}/apply")
def apply_recommendation(
    recommendation_id: uuid.UUID,
    portfolio_id: Optional[uuid.UUID] = Query(None, description="Target portfolio to apply transaction"),
    current_user: User = Depends(get_current_user),
    service: RecommendationService = Depends(get_recommendation_service),
):
    try:
        return service.apply_recommendation(recommendation_id, portfolio_id=portfolio_id, actor_id=current_user.id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/recommendations/{recommendation_id}/dismiss")
def dismiss_recommendation(
    recommendation_id: uuid.UUID,
    reason: Optional[str] = Query(None, description="Dismissal reasoning"),
    current_user: User = Depends(get_current_user),
    service: RecommendationService = Depends(get_recommendation_service),
):
    try:
        return service.dismiss_recommendation(recommendation_id, reason=reason, actor_id=current_user.id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/recommendations/{recommendation_id}/undo")
def undo_recommendation(
    recommendation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    service: RecommendationService = Depends(get_recommendation_service),
):
    try:
        return service.undo_recommendation(recommendation_id, actor_id=current_user.id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
