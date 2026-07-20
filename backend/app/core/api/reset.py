from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.dependencies import get_current_user, get_data_reset_service
from app.core.entities.system import User
from app.core.exceptions import ValidationError
from app.core.redis import consume_backup_receipt
from app.core.services.data_reset import SCOPES, DataResetService

router = APIRouter()


class ResetRequest(BaseModel):
    scopes: list[str] = Field(
        ...,
        description=f"One or more of: {list(SCOPES)}. Pass all five for a full wipe.",
        min_length=1,
    )
    backup_receipt: str = Field(
        ...,
        description=(
            "The receipt returned by GET /portfolio/backup (X-Backup-Receipt response "
            "header). Single-use and expires 10 minutes after export — re-export if it's "
            "been longer, or if data has changed since."
        ),
    )


@router.get("/reset/scopes")
def list_reset_scopes():
    return {"scopes": list(SCOPES)}


@router.get("/reset/preview")
def preview_data_reset(
    scopes: str = Query(
        ...,
        description=f"Comma-separated list of scopes to preview. One or more of: {list(SCOPES)}.",
    ),
    user: User = Depends(get_current_user),
    service: DataResetService = Depends(get_data_reset_service),
):
    """Read-only row counts per scope for a confirmation screen — no deletion,
    no backup-receipt requirement (nothing destructive happens here). Rejects
    while a reset is actually running, since counts would be mid-flux."""
    scope_list = [s.strip() for s in scopes.split(",") if s.strip()]
    try:
        counts = service.preview(scope_list, owner_id=user.id)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"counts": counts}


@router.post("/reset")
def run_data_reset(
    body: ResetRequest,
    user: User = Depends(get_current_user),
    service: DataResetService = Depends(get_data_reset_service),
):
    # Validate scopes before consuming the (single-use) receipt — a typo in the
    # request body shouldn't burn a valid backup and force a re-export.
    unknown = set(body.scopes) - set(SCOPES)
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown reset scope(s): {sorted(unknown)}")

    if not consume_backup_receipt(body.backup_receipt):
        raise HTTPException(
            status_code=409,
            detail=(
                "No valid, unexpired backup found for this receipt. Export a fresh backup "
                "via GET /portfolio/backup and use its X-Backup-Receipt header before "
                "resetting."
            ),
        )

    try:
        results = service.reset(body.scopes, owner_id=user.id, actor_id=user.id)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"status": "success", "cleared": results}
