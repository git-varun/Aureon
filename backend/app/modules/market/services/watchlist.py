from app.core.services.base import BaseService
import uuid
from datetime import timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError
from app.modules.market.entities.market import Asset, LatestQuote
from app.modules.market.entities.watchlist import Watchlist, WatchlistSymbol
from app.modules.market.repositories.ingestion import IngestionRepository
from app.modules.market.repositories.watchlist import WatchlistsRepository
from app.modules.market.services.market import infer_currency, infer_exchange_region


def _previous_close(history: list) -> float | None:
    """Nearest price point >=24h before the latest one in `history` (ascending by
    timestamp), falling back to the oldest point fetched. Mirrors
    MarketService._compute_day_pct's single-asset logic, applied to the same
    batched history window already fetched for the sparkline. None (not 0/latest)
    when no genuine prior point exists, per the no-fake-data policy."""
    if not history:
        return None
    latest = history[-1]
    cutoff = latest.timestamp - timedelta(hours=24)
    prior = next((h for h in reversed(history) if h.timestamp <= cutoff), None)
    if prior is None:
        prior = history[0] if history[0].id != latest.id else None
    if prior is None or float(prior.price) == 0:
        return None
    return float(prior.price)


def _fetch_asset_info(session: Session, symbols: set[str]) -> dict[str, dict]:
    """Single-query enrichment: name, price, type, currency, spark history for each symbol."""
    if not symbols:
        return {}

    stmt = select(LatestQuote).where(LatestQuote.symbol.in_(symbols))
    quotes = session.execute(stmt).scalars().all()
    quote_lookup = {q.symbol: q for q in quotes}

    asset_stmt = select(Asset).where(Asset.symbol.in_(symbols))
    assets = session.execute(asset_stmt).scalars().all()
    asset_lookup = {a.symbol: a for a in assets}

    watchlist_repo = WatchlistsRepository(session)
    history_lookup = watchlist_repo.get_recent_price_history_by_symbols(symbols)

    result = {}
    for sym in symbols:
        q = quote_lookup.get(sym)
        asset = asset_lookup.get(sym)
        price = float(q.price) if q and q.price is not None else None
        exchange, _region = infer_exchange_region(sym)
        history = history_lookup.get(sym)
        spark = [float(h.price) for h in history] if history else ([price] if price is not None else [])
        result[sym] = {
            "name": asset.name if asset else sym,
            "exchange": exchange,
            "currentPrice": price,
            "previousClose": _previous_close(history),
            "assetType": asset.asset_class if asset else "equity",
            "currency": infer_currency(
                asset.asset_class if asset else None, sym, asset.metadata_payload if asset else None
            ),
            "spark": spark,
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

    def create_watchlist(self, user_id: uuid.UUID, name: str) -> dict[str, Any]:
        existing = self.repo.get_by_user_and_name(user_id, name)
        if existing:
            raise ConflictError(f"Watchlist '{name}' already exists")

        wl = Watchlist(user_id=user_id, name=name)
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

        exists = self.repo.get_symbol(watchlist_id, sym_upper)
        if exists:
            raise ConflictError(f"{sym_upper} is already in the watchlist")

        ws = WatchlistSymbol(watchlist_id=watchlist_id, symbol=sym_upper)
        self.repo.save_symbol(ws)

        # Without a real Asset row, this symbol would never enter quote ingestion
        # (list_symbols_for_quote_ingestion scopes to held-or-watchlisted Asset
        # rows) and would sit with no price forever. create_asset_if_missing is
        # an Asset-only insert — unlike ensure_asset_exists, it doesn't also
        # create an AssetSnapshot row, which market/reference.md §44-47 notes
        # was a deliberate removal (an orphaned snapshot with no features/scores
        # ever computed for it, since evaluation only runs for held assets).
        IngestionRepository(self.repo.session).create_asset_if_missing(sym_upper, sym_upper, "equity")
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

        current = self.repo.session.execute(
            select(LatestQuote.price).where(LatestQuote.symbol == ws.symbol)
        ).scalar_one_or_none()

        ws.alert_price = price
        ws.alert_direction = "gte" if current is None or price >= float(current) else "lte"
        ws.alert_triggered = False
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
        ws.alert_direction = None
        ws.alert_triggered = False
        self.repo.session.commit()
        self.repo.session.refresh(wl)

        all_symbols = {s.symbol for s in wl.symbols}
        info = _fetch_asset_info(self.repo.session, all_symbols)
        return _to_dict(wl, info)

    def evaluate_alerts(self, symbol: str, price: float) -> list[dict[str, Any]]:
        """Checks every watchlist alert on `symbol` against the latest `price`.

        Fires (returns a notification payload for) each alert whose threshold
        was just crossed, and updates alert_triggered so a stale-but-still-
        crossed price doesn't re-fire on the next evaluation. Resets
        alert_triggered once price moves back to the non-triggered side, so a
        later re-crossing can fire again.
        """
        fired: list[dict[str, Any]] = []
        changed = False
        for ws, user_id in self.repo.list_active_alerts_for_symbol(symbol):
            target = float(ws.alert_price)
            is_triggered_side = price >= target if ws.alert_direction == "gte" else price <= target

            if is_triggered_side and not ws.alert_triggered:
                ws.alert_triggered = True
                changed = True
                verb = "rose to" if ws.alert_direction == "gte" else "fell to"
                fired.append({
                    "user_id": user_id,
                    "title": f"{symbol} alert triggered",
                    "message": f"{symbol} {verb} {price:g}, target was {target:g}",
                    "type": "info",
                })
            elif not is_triggered_side and ws.alert_triggered:
                ws.alert_triggered = False
                changed = True

        if changed:
            self.repo.session.commit()
        return fired
