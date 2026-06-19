from app.domain.services.base import BaseService
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError
from app.domain.entities.market import LatestQuote
from app.domain.entities.watchlist import Watchlist, WatchlistSymbol
from app.infrastructure.repositories.watchlist import WatchlistsRepository


def _fetch_asset_info(session: Session, symbols: set[str]) -> dict[str, dict]:
    """Single-query enrichment: name, price for each symbol."""
    if not symbols:
        return {}

    stmt = select(LatestQuote).where(LatestQuote.symbol.in_(symbols))
    quotes = session.execute(stmt).scalars().all()
    quote_lookup = {q.symbol: q for q in quotes}
    
    result = {}
    for sym in symbols:
        q = quote_lookup.get(sym)
        price = float(q.price) if q and q.price is not None else 0.0
        result[sym] = {
            "name": sym,
            "exchange": "NSE" if sym.endswith(".NS") else "NASDAQ",
            "currentPrice": price,
            "previousClose": price,
            "assetType": "equity",
            "currency": "INR" if sym.endswith(".NS") else "USD",
            "spark": [price],
        }
    return result

def _to_dict(wl: Watchlist, asset_info: dict[str, dict] | None = None) -> dict[str, Any]:
    info = asset_info or {}
    return {
        "id": str(wl.id),
        "name": wl.name,
        "symbols": [
            {
                "symbol": s.symbol,
                "alertPrice": float(s.alert_price) if s.alert_price is not None else None,
                **info.get(s.symbol, {})
            }
            for s in wl.symbols
        ],
        "created_at": wl.created_at.isoformat() if wl.created_at else None,
    }

class WatchlistService(BaseService):
    def __init__(self, repo: WatchlistsRepository):
        self.repo = repo

    def _get_or_404(self, watchlist_id: uuid.UUID, user_id: uuid.UUID) -> Watchlist:
        wl = self.repo.get(watchlist_id)
        if not wl or wl.user_id != user_id:
            raise NotFoundError("Watchlist not found")
        return wl

    def list_watchlists(self, user_id: uuid.UUID) -> list[dict[str, Any]]:
        rows = self.repo.list_by_user(user_id)
        all_symbols = {s.symbol for wl in rows for s in wl.symbols}
        info = _fetch_asset_info(self.repo.session, all_symbols)
        return [_to_dict(w, info) for w in rows]

    def create_watchlist(self, user_id: uuid.UUID, name: str, organization_id: uuid.UUID | None = None) -> dict[str, Any]:
        existing = self.repo.get_by_user_and_name(user_id, name)
        if existing:
            raise ConflictError(f"Watchlist '{name}' already exists")
        
        wl = Watchlist(user_id=user_id, name=name, organization_id=organization_id)
        self.repo.save(wl)
        self.repo.session.commit()
        self.repo.session.refresh(wl)
        return _to_dict(wl)

    def rename_watchlist(self, watchlist_id: uuid.UUID, user_id: uuid.UUID, name: str) -> dict[str, Any]:
        wl = self._get_or_404(watchlist_id, user_id)
        
        # Check unique constraint
        existing = self.repo.get_by_user_and_name(user_id, name)
        if existing and existing.id != watchlist_id:
            raise ConflictError(f"Watchlist '{name}' already exists")
            
        wl.name = name
        self.repo.session.commit()
        self.repo.session.refresh(wl)
        
        all_symbols = {s.symbol for s in wl.symbols}
        info = _fetch_asset_info(self.repo.session, all_symbols)
        return _to_dict(wl, info)

    def delete_watchlist(self, watchlist_id: uuid.UUID, user_id: uuid.UUID) -> None:
        wl = self._get_or_404(watchlist_id, user_id)
        self.repo.delete(wl)
        self.repo.session.commit()

    def add_symbol(self, watchlist_id: uuid.UUID, user_id: uuid.UUID, symbol: str) -> dict[str, Any]:
        wl = self._get_or_404(watchlist_id, user_id)
        sym_upper = symbol.upper().strip()
        
        # In canonical code, we ensure asset exists in latest_quotes
        from app.domain.services.portfolio import _ensure_asset_exists
        _ensure_asset_exists(self.repo.session, sym_upper)

        exists = self.repo.get_symbol(watchlist_id, sym_upper)
        if exists:
            raise ConflictError(f"{sym_upper} is already in the watchlist")

        ws = WatchlistSymbol(watchlist_id=watchlist_id, symbol=sym_upper)
        self.repo.save_symbol(ws)
        self.repo.session.commit()
        self.repo.session.refresh(wl)

        all_symbols = {s.symbol for s in wl.symbols}
        info = _fetch_asset_info(self.repo.session, all_symbols)
        return _to_dict(wl, info)

    def remove_symbol(self, watchlist_id: uuid.UUID, user_id: uuid.UUID, symbol: str) -> dict[str, Any]:
        wl = self._get_or_404(watchlist_id, user_id)
        ws = self.repo.get_symbol(watchlist_id, symbol)
        if not ws:
            raise NotFoundError(f"Symbol {symbol} not in watchlist")

        self.repo.delete_symbol(ws)
        self.repo.session.commit()
        self.repo.session.refresh(wl)

        all_symbols = {s.symbol for s in wl.symbols}
        info = _fetch_asset_info(self.repo.session, all_symbols)
        return _to_dict(wl, info)

    def set_alert(self, watchlist_id: uuid.UUID, user_id: uuid.UUID, symbol: str, price: float) -> dict[str, Any]:
        wl = self._get_or_404(watchlist_id, user_id)
        ws = self.repo.get_symbol(watchlist_id, symbol)
        if not ws:
            raise NotFoundError(f"Symbol {symbol} not in watchlist")

        ws.alert_price = price
        self.repo.session.commit()
        self.repo.session.refresh(wl)

        all_symbols = {s.symbol for s in wl.symbols}
        info = _fetch_asset_info(self.repo.session, all_symbols)
        return _to_dict(wl, info)

    def clear_alert(self, watchlist_id: uuid.UUID, user_id: uuid.UUID, symbol: str) -> dict[str, Any]:
        wl = self._get_or_404(watchlist_id, user_id)
        ws = self.repo.get_symbol(watchlist_id, symbol)
        if not ws:
            raise NotFoundError(f"Symbol {symbol} not in watchlist")

        ws.alert_price = None
        self.repo.session.commit()
        self.repo.session.refresh(wl)

        all_symbols = {s.symbol for s in wl.symbols}
        info = _fetch_asset_info(self.repo.session, all_symbols)
        return _to_dict(wl, info)
