"""Watchlist service layer."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.modules.portfolio.models import Asset, PriceHistory
from app.shared.exceptions import ConflictError, NotFoundError

from .models import Watchlist, WatchlistSymbol


def _fetch_asset_info(session: Session, symbols: set[str]) -> dict[str, dict]:
    """Single-query enrichment: name, exchange, price, spark for each symbol."""
    if not symbols:
        return {}

    assets = {
        a.symbol: a
        for a in session.query(Asset).filter(Asset.symbol.in_(symbols)).all()
    }

    cutoff = datetime.utcnow() - timedelta(days=35)
    spark_lookup: dict[str, list[float]] = {}
    for close, sym in (
        session.query(PriceHistory.close, Asset.symbol)
        .join(Asset, PriceHistory.asset_id == Asset.id)
        .filter(Asset.symbol.in_(symbols), PriceHistory.date >= cutoff)
        .order_by(PriceHistory.date.asc())
        .all()
    ):
        spark_lookup.setdefault(sym, []).append(close)

    result = {}
    for sym, a in assets.items():
        result[sym] = {
            "name": a.name,
            "exchange": a.exchange,
            "currentPrice": a.current_price,
            "previousClose": a.previous_close,
            "assetType": a.asset_type if isinstance(a.asset_type, str) else getattr(a.asset_type, 'value', str(a.asset_type)),
            "currency": a.currency or "INR",
            "spark": spark_lookup.get(sym, []),
        }
    return result


def _to_dict(wl: Watchlist, asset_info: dict[str, dict] | None = None) -> dict[str, Any]:
    info = asset_info or {}
    return {
        "id": wl.id,
        "name": wl.name,
        "symbols": [
            {"symbol": s.symbol, "alertPrice": s.alert_price, **info.get(s.symbol, {})}
            for s in wl.symbols
        ],
        "created_at": wl.created_at.isoformat() if wl.created_at else None,
    }


def _get_or_404(session: Session, watchlist_id: int, user_id: int) -> Watchlist:
    wl = session.query(Watchlist).filter(
        Watchlist.id == watchlist_id, Watchlist.user_id == user_id
    ).first()
    if not wl:
        raise NotFoundError("Watchlist not found")
    return wl


def _get_symbol_or_404(session: Session, watchlist_id: int, symbol: str) -> WatchlistSymbol:
    ws = session.query(WatchlistSymbol).filter(
        WatchlistSymbol.watchlist_id == watchlist_id,
        WatchlistSymbol.symbol == symbol.upper(),
    ).first()
    if not ws:
        raise NotFoundError(f"Symbol {symbol} not in watchlist")
    return ws


def _wl_symbols(wl: Watchlist) -> set[str]:
    return {s.symbol for s in wl.symbols}


def list_watchlists(session: Session, user_id: int) -> list[dict[str, Any]]:
    rows = session.query(Watchlist).filter(Watchlist.user_id == user_id).all()
    all_symbols = {s.symbol for wl in rows for s in wl.symbols}
    info = _fetch_asset_info(session, all_symbols)
    return [_to_dict(w, info) for w in rows]


def create_watchlist(session: Session, user_id: int, name: str) -> dict[str, Any]:
    existing = session.query(Watchlist).filter(
        Watchlist.user_id == user_id, Watchlist.name == name
    ).first()
    if existing:
        raise ConflictError(f"Watchlist '{name}' already exists")
    wl = Watchlist(user_id=user_id, name=name)
    session.add(wl)
    session.commit()
    session.refresh(wl)
    return _to_dict(wl)


def rename_watchlist(session: Session, watchlist_id: int, user_id: int, name: str) -> dict[str, Any]:
    wl = _get_or_404(session, watchlist_id, user_id)
    wl.name = name
    session.commit()
    session.refresh(wl)
    info = _fetch_asset_info(session, _wl_symbols(wl))
    return _to_dict(wl, info)


def delete_watchlist(session: Session, watchlist_id: int, user_id: int) -> None:
    wl = _get_or_404(session, watchlist_id, user_id)
    session.delete(wl)
    session.commit()


def add_symbol(session: Session, watchlist_id: int, user_id: int, symbol: str) -> dict[str, Any]:
    wl = _get_or_404(session, watchlist_id, user_id)
    sym_upper = symbol.upper()
    if not session.query(Asset).filter(Asset.symbol == sym_upper).first():
        raise NotFoundError(f"Asset {sym_upper} not found")
    exists = session.query(WatchlistSymbol).filter(
        WatchlistSymbol.watchlist_id == watchlist_id,
        WatchlistSymbol.symbol == sym_upper,
    ).first()
    if exists:
        raise ConflictError(f"{sym_upper} is already in the watchlist")
    session.add(WatchlistSymbol(watchlist_id=watchlist_id, symbol=sym_upper))
    session.commit()
    session.refresh(wl)
    info = _fetch_asset_info(session, _wl_symbols(wl))
    return _to_dict(wl, info)


def remove_symbol(session: Session, watchlist_id: int, user_id: int, symbol: str) -> dict[str, Any]:
    wl = _get_or_404(session, watchlist_id, user_id)
    ws = _get_symbol_or_404(session, watchlist_id, symbol)
    session.delete(ws)
    session.commit()
    session.refresh(wl)
    info = _fetch_asset_info(session, _wl_symbols(wl))
    return _to_dict(wl, info)


def set_alert(session: Session, watchlist_id: int, user_id: int, symbol: str, price: float) -> dict[str, Any]:
    wl = _get_or_404(session, watchlist_id, user_id)
    ws = _get_symbol_or_404(session, watchlist_id, symbol)
    ws.alert_price = price
    session.commit()
    session.refresh(wl)
    info = _fetch_asset_info(session, _wl_symbols(wl))
    return _to_dict(wl, info)


def clear_alert(session: Session, watchlist_id: int, user_id: int, symbol: str) -> dict[str, Any]:
    wl = _get_or_404(session, watchlist_id, user_id)
    ws = _get_symbol_or_404(session, watchlist_id, symbol)
    ws.alert_price = None
    session.commit()
    session.refresh(wl)
    info = _fetch_asset_info(session, _wl_symbols(wl))
    return _to_dict(wl, info)
