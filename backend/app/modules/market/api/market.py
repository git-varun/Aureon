import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_market_service, serialize_user_profile
from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.core.entities.system import User
from app.modules.market.services.market import MarketService

router = APIRouter()


@router.get("/assets/{asset_id}/snapshot")
def get_asset_snapshot(asset_id: uuid.UUID, svc: MarketService = Depends(get_market_service)) -> dict[str, Any]:
    try:
        return svc.get_asset_snapshot(asset_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e.message)) from e

@router.get("/assets/{asset_id}/features")
def get_asset_features(asset_id: uuid.UUID, svc: MarketService = Depends(get_market_service)) -> dict[str, Any]:
    try:
        return svc.get_asset_features(asset_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e.message)) from e


@router.get("/indices")
def market_indices(svc: MarketService = Depends(get_market_service)):
    return svc.get_indices()

@router.get("/sectors")
def market_sectors(svc: MarketService = Depends(get_market_service)):
    return svc.get_sectors()

@router.get("/movers")
def market_movers(svc: MarketService = Depends(get_market_service)):
    return svc.get_movers()

@router.get("/themes")
def list_themes(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    svc: MarketService = Depends(get_market_service),
):
    profile = serialize_user_profile(user, db)
    return svc.list_themes(profile.get("custom_themes", {}), user.id)

@router.get("/themes/{theme_id}")
def get_theme_detail(
    theme_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    svc: MarketService = Depends(get_market_service),
):
    profile = serialize_user_profile(user, db)
    try:
        return svc.get_theme_detail(theme_id, profile.get("custom_themes", {}))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e.message)) from e

@router.get("/themes/{theme_id}/signals")
def get_theme_signals(
    theme_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    svc: MarketService = Depends(get_market_service),
):
    profile = serialize_user_profile(user, db)
    try:
        return svc.get_theme_signals(theme_id, profile.get("custom_themes", {}))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e.message)) from e

@router.get("/themes/{theme_id}/nav")
def get_theme_nav(
    theme_id: str,
    days: int = Query(365, ge=14, le=1825),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    svc: MarketService = Depends(get_market_service),
):
    profile = serialize_user_profile(user, db)
    try:
        return svc.get_theme_nav(theme_id, days, profile.get("custom_themes", {}))
    except NotFoundError as e:
        status_code = 422 if "price history" in str(e.message).lower() else 404
        raise HTTPException(status_code=status_code, detail=str(e.message)) from e

class ForkThemeRequest(BaseModel):
    name: str

@router.post("/themes/{theme_id}/fork")
def fork_theme(
    theme_id: str,
    body: ForkThemeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    svc: MarketService = Depends(get_market_service),
):
    profile = serialize_user_profile(user, db)
    try:
        new_theme = svc.fork_theme(theme_id, body.name, user, profile.get("custom_themes", {}))
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e.message)) from e
    return serialize_user_profile(user, db)["custom_themes"][new_theme.theme_id]

class UpdateThemeWeightsRequest(BaseModel):
    name: Optional[str] = None
    weights: Optional[dict[str, float]] = None

@router.put("/themes/{theme_id}")
def update_theme(
    theme_id: str,
    body: UpdateThemeWeightsRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    svc: MarketService = Depends(get_market_service),
):
    try:
        svc.update_theme(theme_id, body.name, body.weights, user)
    except NotFoundError as e:
        raise HTTPException(status_code=403, detail=str(e.message)) from e
    return serialize_user_profile(user, db)["custom_themes"][theme_id]

@router.delete("/themes/{theme_id}")
def delete_theme(
    theme_id: str,
    user: User = Depends(get_current_user),
    svc: MarketService = Depends(get_market_service),
):
    try:
        svc.delete_theme(theme_id, user)
    except NotFoundError as e:
        raise HTTPException(status_code=403, detail=str(e.message)) from e
    return {"status": "deleted", "theme_id": theme_id}

@router.post("/symbols/{symbol}/backfill")
def trigger_backfill(
    symbol: str,
    user: User = Depends(get_current_user),
    svc: MarketService = Depends(get_market_service),
):
    from app.workers.ingestion.tasks import admin_backfill_assets

    asset = svc.repo.get_asset_by_symbol(symbol.upper().strip())
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    task = admin_backfill_assets.delay([str(asset.id)])
    return {"status": "queued", "symbol": symbol, "task_id": task.id}

@router.get("/themes-for/{symbol}")
def get_themes_for_symbol(
    symbol: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    svc: MarketService = Depends(get_market_service),
):
    profile = serialize_user_profile(user, db)
    return svc.get_themes_for_symbol(symbol, profile.get("custom_themes", {}))

@router.get("/sectors/{name}")
def get_sector_detail(name: str, svc: MarketService = Depends(get_market_service)):
    return svc.get_sector_detail(name)

@router.get("/search")
def search_market(q: str = Query(...), svc: MarketService = Depends(get_market_service)):
    return svc.search(q)

@router.get("/universe")
def get_market_universe(
    region: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    live: bool = Query(False),
    svc: MarketService = Depends(get_market_service),
):
    return svc.get_universe(search=search)

@router.post("/refresh")
def refresh_market():
    from app.workers.ingestion.tasks import refresh_prices_task

    task = refresh_prices_task.delay()
    return {"status": "queued", "task_id": task.id}
