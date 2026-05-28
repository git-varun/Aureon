from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.dependencies import get_session, require_auth
from app.shared.exceptions import ConflictError, NotFoundError
from app.modules.watchlist import services

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


class CreateWatchlistIn(BaseModel):
    name: str


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
def list_watchlists(session=Depends(get_session), user=Depends(require_auth)):
    return services.list_watchlists(session, user.id)


@router.post("/", status_code=201)
def create_watchlist(body: CreateWatchlistIn, session=Depends(get_session), user=Depends(require_auth)):
    return _handle(services.create_watchlist, session, user.id, body.name)


@router.put("/{watchlist_id}")
def rename_watchlist(watchlist_id: int, body: RenameWatchlistIn, session=Depends(get_session), user=Depends(require_auth)):
    return _handle(services.rename_watchlist, session, watchlist_id, user.id, body.name)


@router.delete("/{watchlist_id}", status_code=204)
def delete_watchlist(watchlist_id: int, session=Depends(get_session), user=Depends(require_auth)):
    _handle(services.delete_watchlist, session, watchlist_id, user.id)


@router.post("/{watchlist_id}/symbols")
def add_symbol(watchlist_id: int, body: AddSymbolIn, session=Depends(get_session), user=Depends(require_auth)):
    return _handle(services.add_symbol, session, watchlist_id, user.id, body.symbol)


@router.delete("/{watchlist_id}/symbols/{symbol}")
def remove_symbol(watchlist_id: int, symbol: str, session=Depends(get_session), user=Depends(require_auth)):
    return _handle(services.remove_symbol, session, watchlist_id, user.id, symbol)


@router.put("/{watchlist_id}/symbols/{symbol}/alert")
def set_alert(watchlist_id: int, symbol: str, body: SetAlertIn, session=Depends(get_session), user=Depends(require_auth)):
    return _handle(services.set_alert, session, watchlist_id, user.id, symbol, body.price)


@router.delete("/{watchlist_id}/symbols/{symbol}/alert")
def clear_alert(watchlist_id: int, symbol: str, session=Depends(get_session), user=Depends(require_auth)):
    return _handle(services.clear_alert, session, watchlist_id, user.id, symbol)
