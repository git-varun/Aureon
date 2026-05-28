from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.dependencies import require_auth
from app.modules.market import services
from app.modules.market import signal_service

router = APIRouter(prefix="/api/market", tags=["market"])


class ForkRequest(BaseModel):
    name: str = ""


class UpdateThemeRequest(BaseModel):
    name: Optional[str] = None
    weights: Optional[dict] = None


@router.post("/refresh")
def trigger_market_refresh(_user=Depends(require_auth)):
    from app.tasks.market import market_refresh_task
    task = market_refresh_task.delay()
    return {"status": "queued", "task_id": task.id}


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
def market_themes(user=Depends(require_auth)):
    return services.get_themes(user_id=user.id)


@router.get("/themes/{theme_id}/nav")
def theme_nav(theme_id: str, days: int = Query(365, ge=14, le=1825), _user=Depends(require_auth)):
    from app.modules.market.nav_service import compute_theme_nav
    nav = compute_theme_nav(theme_id, days)
    if nav is None:
        raise HTTPException(status_code=404, detail="No price history available")
    return {"theme_id": theme_id, "nav": nav, "base": 100, "data_points": len(nav)}


@router.post("/themes/{theme_id}/fork")
def fork_theme(theme_id: str, body: ForkRequest, user=Depends(require_auth)):
    result = services.fork_theme(theme_id, body.name, user.id)
    if not result:
        raise HTTPException(status_code=404, detail="Theme not found")
    return result


@router.put("/themes/{theme_id}")
def update_theme(theme_id: str, body: UpdateThemeRequest, user=Depends(require_auth)):
    try:
        result = services.update_theme(theme_id, user.id, name=body.name, weights=body.weights)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    if result is None:
        raise HTTPException(status_code=403, detail="Not authorized or theme not found")
    return result


@router.delete("/themes/{theme_id}")
def delete_theme(theme_id: str, user=Depends(require_auth)):
    ok = services.delete_theme(theme_id, user.id)
    if not ok:
        raise HTTPException(status_code=403, detail="Not authorized or theme not found")
    return {"status": "deleted", "theme_id": theme_id}


@router.post("/symbols/{symbol}/backfill")
def trigger_backfill(symbol: str, user=Depends(require_auth)):
    from app.modules.portfolio.models import Asset, PriceHistory
    from app.core.db import SessionLocal

    with SessionLocal() as db:
        asset = db.query(Asset).filter_by(symbol=symbol).first()
        if asset:
            count = db.query(PriceHistory).filter_by(asset_id=asset.id).count()
            if count >= 100:
                return {"status": "already_populated", "symbol": symbol, "rows": count}

    from app.tasks.market import backfill_symbol_task
    backfill_symbol_task.delay(symbol, user.id)
    return {"status": "queued", "symbol": symbol}


@router.post("/themes/{theme_id}/curate")
def curate_theme(theme_id: str, user=Depends(require_auth)):
    """Re-curate a theme's constituents using AI based on current signals."""
    import json
    from datetime import date

    from app.core.db import SessionLocal
    from app.modules.market.models import MarketTheme, ThemeWeight

    with SessionLocal() as db:
        theme = db.query(MarketTheme).filter_by(theme_id=theme_id).first()
        if not theme:
            raise HTTPException(status_code=404, detail="Theme not found")
        if theme.owner_id is None or theme.owner_id != user.id:
            raise HTTPException(status_code=403, detail="Not authorized")

        # Build universe and signals context
        universe_data = services.get_universe()
        universe_slim = [{"sym": u["sym"], "sector": u.get("sector", ""), "mcap": u.get("mcap")} for u in universe_data]

        signals_summary: dict = {}
        try:
            from app.modules.signals.models import Signal
            sig_rows = db.query(Signal).order_by(Signal.created_at.desc()).limit(200).all()
            for s in sig_rows:
                if s.symbol not in signals_summary:
                    signals_summary[s.symbol] = f"RSI={s.rsi_14:.0f} signal={s.signal_type}" if hasattr(s, "rsi_14") and s.rsi_14 else s.signal_type
        except Exception:
            pass

        signals_available = bool(signals_summary)

        try:
            from app.modules.config.services import ConfigService
            from app.modules.analytics.ai_service import build_ai_service
            ai = build_ai_service(ConfigService.get_credential_manager(db))
            symbols = ai.curate_theme_constituents(theme.desc, universe_slim, signals_summary)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"AI curation failed: {exc}")

        if not symbols:
            raise HTTPException(status_code=502, detail="AI returned empty symbol list")

        today = date.today()
        w = round(1.0 / len(symbols), 6)
        db.query(ThemeWeight).filter_by(theme_id=theme_id, effective_date=today).delete()
        for sym in symbols:
            db.add(ThemeWeight(theme_id=theme_id, symbol=sym, weight=w, effective_date=today))

        theme.symbols = json.dumps(symbols)
        db.commit()

    detail = services.get_theme_detail(theme_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Theme not found after curation")
    detail["signals_available"] = signals_available
    return detail


@router.get("/themes/{theme_id}/signals")
def theme_signals(theme_id: str, _user=Depends(require_auth)):
    result = signal_service.compute_theme_signals(theme_id)
    if result is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="No price data available for this theme")
    return result


@router.get("/themes/{theme_id}")
def market_theme_detail(theme_id: str, _user=Depends(require_auth)):
    detail = services.get_theme_detail(theme_id)
    if not detail:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Theme not found")
    return detail


@router.get("/themes-for/{symbol}")
def themes_for_symbol(symbol: str, _user=Depends(require_auth)):
    return services.get_themes_for_symbol(symbol)


@router.get("/universe")
def market_universe(
    region: Optional[str] = Query(None, description="Filter by region code (IN, US, EU, AS)"),
    search: Optional[str] = Query(None, description="Search by symbol or name"),
    live: bool = Query(False, description="Fall back to yfinance for unknown symbols"),
    _user=Depends(require_auth),
):
    return services.get_universe(region=region, search=search, live=live)


@router.get("/search")
def market_search(
    q: str = Query(..., description="Symbol or company name to look up globally"),
    _user=Depends(require_auth),
):
    """Live symbol lookup via yfinance — returns universe-compatible dicts."""
    return services.search_yfinance(q)


@router.get("/sectors/{name}")
def market_sector_detail(name: str, _user=Depends(require_auth)):
    """Sector detail with constituent stocks from the universe."""
    from fastapi import HTTPException
    detail = services.get_sector_detail(name)
    if not detail:
        raise HTTPException(status_code=404, detail=f"Sector '{name}' not found")
    return detail
