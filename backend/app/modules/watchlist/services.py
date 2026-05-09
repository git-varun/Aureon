"""Watchlist service layer."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.shared.exceptions import ConflictError, NotFoundError

from .models import Watchlist, WatchlistSymbol


def _to_dict(wl: Watchlist) -> dict[str, Any]:
    return {
        "id": wl.id,
        "name": wl.name,
        "symbols": [
            {"symbol": s.symbol, "alertPrice": s.alert_price}
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


def list_watchlists(session: Session, user_id: int) -> list[dict[str, Any]]:
    rows = session.query(Watchlist).filter(Watchlist.user_id == user_id).all()
    return [_to_dict(w) for w in rows]


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
    return _to_dict(wl)


def delete_watchlist(session: Session, watchlist_id: int, user_id: int) -> None:
    wl = _get_or_404(session, watchlist_id, user_id)
    session.delete(wl)
    session.commit()


def add_symbol(session: Session, watchlist_id: int, user_id: int, symbol: str) -> dict[str, Any]:
    wl = _get_or_404(session, watchlist_id, user_id)
    sym_upper = symbol.upper()
    exists = session.query(WatchlistSymbol).filter(
        WatchlistSymbol.watchlist_id == watchlist_id,
        WatchlistSymbol.symbol == sym_upper,
    ).first()
    if exists:
        raise ConflictError(f"{sym_upper} is already in the watchlist")
    session.add(WatchlistSymbol(watchlist_id=watchlist_id, symbol=sym_upper))
    session.commit()
    session.refresh(wl)
    return _to_dict(wl)


def remove_symbol(session: Session, watchlist_id: int, user_id: int, symbol: str) -> dict[str, Any]:
    wl = _get_or_404(session, watchlist_id, user_id)
    ws = _get_symbol_or_404(session, watchlist_id, symbol)
    session.delete(ws)
    session.commit()
    session.refresh(wl)
    return _to_dict(wl)


def set_alert(session: Session, watchlist_id: int, user_id: int, symbol: str, price: float) -> dict[str, Any]:
    wl = _get_or_404(session, watchlist_id, user_id)
    ws = _get_symbol_or_404(session, watchlist_id, symbol)
    ws.alert_price = price
    session.commit()
    session.refresh(wl)
    return _to_dict(wl)


def clear_alert(session: Session, watchlist_id: int, user_id: int, symbol: str) -> dict[str, Any]:
    wl = _get_or_404(session, watchlist_id, user_id)
    ws = _get_symbol_or_404(session, watchlist_id, symbol)
    ws.alert_price = None
    session.commit()
    session.refresh(wl)
    return _to_dict(wl)
