from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.core.dependencies import require_auth
from app.modules.market import services

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/indices")
def market_indices(_user=Depends(require_auth)):
    return services.get_indices()


@router.get("/sectors")
def market_sectors(_user=Depends(require_auth)):
    return services.get_sectors()


@router.get("/movers")
def market_movers(_user=Depends(require_auth)):
    return services.get_movers()


@router.get("/themes")
def market_themes(_user=Depends(require_auth)):
    return services.get_themes()


@router.get("/universe")
def market_universe(
    region: Optional[str] = Query(None, description="Filter by region code (IN, US, EU, AS)"),
    search: Optional[str] = Query(None, description="Search by symbol or name"),
    _user=Depends(require_auth),
):
    return services.get_universe(region=region, search=search)
