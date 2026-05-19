"""Recommendations API routes — under /api/aureon/recommendations."""

from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import get_session, require_auth

from .schemas import RecommendationDismissIn, SeedResult
from .services import DEFAULT_FIXTURES, RecommendationService

router = APIRouter(prefix="/api/aureon/recommendations", tags=["recommendations"])


@router.get("")
def list_recommendations(
        status: Optional[str] = None,
        session: Session = Depends(get_session),
        current_user=Depends(require_auth),
):
    return {"items": RecommendationService.list(session, user_id=current_user.id, status=status)}


@router.post("/{ext_id}/apply")
def apply_recommendation(
        ext_id: str,
        session: Session = Depends(get_session),
        current_user=Depends(require_auth),
):
    return RecommendationService.apply(session, ext_id, user_id=current_user.id)


@router.post("/{ext_id}/dismiss")
def dismiss_recommendation(
        ext_id: str,
        body: RecommendationDismissIn = RecommendationDismissIn(),
        session: Session = Depends(get_session),
        current_user=Depends(require_auth),
):
    return RecommendationService.dismiss(session, ext_id, reason=body.reason, user_id=current_user.id)


@router.post("/{ext_id}/undo")
def undo_recommendation(
        ext_id: str,
        session: Session = Depends(get_session),
        current_user=Depends(require_auth),
):
    return RecommendationService.undo(session, ext_id, user_id=current_user.id)


@router.post("/seed", response_model=SeedResult)
def seed_recommendations(
        session: Session = Depends(get_session),
        current_user=Depends(require_auth),
):
    inserted, skipped = RecommendationService.seed(session, DEFAULT_FIXTURES, user_id=current_user.id)
    return SeedResult(inserted=inserted, skipped=skipped)
