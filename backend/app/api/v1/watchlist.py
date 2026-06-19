import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.dependencies import get_current_user, get_watchlist_service
from app.core.exceptions import ConflictError, NotFoundError
from app.domain.entities.system import User
from app.domain.services.watchlist import WatchlistService

router = APIRouter(prefix="/watchlist", tags=["watchlist"])

class CreateWatchlistIn(BaseModel):
    name: str
    organization_id: Optional[uuid.UUID] = None

class RenameWatchlistIn(BaseModel):
    name: str

class AddSymbolIn(BaseModel):
    symbol: str

class SetAlertIn(BaseModel):
    price: float

def _handle(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))

@router.get("/")
def list_watchlists(
    user: User = Depends(get_current_user),
    service: WatchlistService = Depends(get_watchlist_service)
):
    return service.list_watchlists(user.id)

@router.post("/", status_code=201)
def create_watchlist(
    body: CreateWatchlistIn,
    user: User = Depends(get_current_user),
    service: WatchlistService = Depends(get_watchlist_service)
):
    return _handle(service.create_watchlist, user.id, body.name, body.organization_id)

@router.put("/{watchlist_id}")
def rename_watchlist(
    watchlist_id: uuid.UUID,
    body: RenameWatchlistIn,
    user: User = Depends(get_current_user),
    service: WatchlistService = Depends(get_watchlist_service)
):
    return _handle(service.rename_watchlist, watchlist_id, user.id, body.name)

@router.delete("/{watchlist_id}", status_code=204)
def delete_watchlist(
    watchlist_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: WatchlistService = Depends(get_watchlist_service)
):
    _handle(service.delete_watchlist, watchlist_id, user.id)

@router.post("/{watchlist_id}/symbols")
def add_symbol(
    watchlist_id: uuid.UUID,
    body: AddSymbolIn,
    user: User = Depends(get_current_user),
    service: WatchlistService = Depends(get_watchlist_service)
):
    return _handle(service.add_symbol, watchlist_id, user.id, body.symbol)

@router.delete("/{watchlist_id}/symbols/{symbol}")
def remove_symbol(
    watchlist_id: uuid.UUID,
    symbol: str,
    user: User = Depends(get_current_user),
    service: WatchlistService = Depends(get_watchlist_service)
):
    return _handle(service.remove_symbol, watchlist_id, user.id, symbol)

@router.put("/{watchlist_id}/symbols/{symbol}/alert")
def set_alert(
    watchlist_id: uuid.UUID,
    symbol: str,
    body: SetAlertIn,
    user: User = Depends(get_current_user),
    service: WatchlistService = Depends(get_watchlist_service)
):
    return _handle(service.set_alert, watchlist_id, user.id, symbol, body.price)

@router.delete("/{watchlist_id}/symbols/{symbol}/alert")
def clear_alert(
    watchlist_id: uuid.UUID,
    symbol: str,
    user: User = Depends(get_current_user),
    service: WatchlistService = Depends(get_watchlist_service)
):
    return _handle(service.clear_alert, watchlist_id, user.id, symbol)
