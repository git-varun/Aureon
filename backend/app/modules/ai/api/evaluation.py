import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies import get_evaluation_service
from app.core.exceptions import NotFoundError
from app.modules.ai.services.evaluation import EvaluationService

router = APIRouter()

@router.get("/assets/{asset_id}/scores")
def get_asset_scores(
    asset_id: uuid.UUID,
    model_version: str = "v1.0.0",
    svc: EvaluationService = Depends(get_evaluation_service),
) -> dict[str, Any]:
    try:
        return svc.get_asset_scores(asset_id, model_version)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e.message)) from e
