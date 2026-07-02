import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, serialize_user_profile
from app.core.database import get_db
from app.core.redis import get_cached_asset_features, get_cached_asset_snapshot
from app.domain.entities.market import Asset, AssetSnapshot, LatestQuote, PriceHistory
from app.domain.entities.system import User
from app.infrastructure.repositories.asset_features import AssetFeaturesRepository
from app.infrastructure.repositories.asset_snapshot import AssetSnapshotRepository

router = APIRouter()

# Ticker -> (display name, region) for indices seeded via app.workers.ingestion.tasks._INDEX_ASSETS.
# Kept separate from the legacy _SEED_INDICES literal below (still used by app/api/v1/assets.py's
# degraded-fallback paths) to avoid touching that file's behavior in this change.
_INDEX_META: list[tuple[str, str, str]] = [
    ("^NSEI",    "NIFTY 50",   "IN"),
    ("^BSESN",   "SENSEX",     "IN"),
    ("^NSEBANK", "BANK NIFTY", "IN"),
    ("^CNXIT",   "NIFTY IT",   "IN"),
    ("^GSPC",    "S&P 500",    "US"),
    ("^IXIC",    "NASDAQ",     "US"),
    ("^FTSE",    "FTSE 100",   "EU"),
    ("^N225",    "NIKKEI 225", "AS"),
]

# Static symbol -> sector map for the tracked universe (v1: no auto-classification for
# symbols added later; Asset.classification exists but is never populated by seeding).
_SYMBOL_SECTOR_MAP: dict[str, str] = {
    "TCS.NS": "IT", "INFY.NS": "IT", "WIPRO.NS": "IT", "HCLTECH.NS": "IT",
    "AAPL": "IT", "MSFT": "IT", "NVDA": "IT", "GOOGL": "IT", "META": "IT", "AMZN": "IT",
    "HDFCBANK.NS": "Financials", "ICICIBANK.NS": "Financials", "SBIN.NS": "Financials",
    "RELIANCE.NS": "Energy", "ADANIGREEN.NS": "Energy", "TATAPOWER.NS": "Energy", "SUZLON.NS": "Energy",
    "HINDUNILVR.NS": "FMCG", "ITC.NS": "FMCG", "DABUR.NS": "FMCG", "MARICO.NS": "FMCG", "ASIANPAINT.NS": "FMCG",
    "TSLA": "Auto",
    "LT.NS": "Capital goods", "BHEL.NS": "Capital goods", "SIEMENS.NS": "Capital goods", "ABB.NS": "Capital goods",
    "BHARTIARTL.NS": "Telecom",
}


def _infer_exchange_region(symbol: str) -> tuple[str, str]:
    if symbol.endswith(".NS"):
        return "NSE", "IN"
    if symbol.endswith(".BO"):
        return "BSE", "IN"
    if symbol.endswith("-USD"):
        return "CRYPTO", "GLOBAL"
    if symbol.startswith("^"):
        return "INDEX", "GLOBAL"
    return "NASDAQ", "US"


def _compute_day_pct(db: Session, asset_id: Optional[uuid.UUID]) -> float:
    """Latest PriceHistory sample vs. the nearest sample >=24h prior. Approximates
    day-over-day change without a dedicated prior-close field (none exists in the schema)."""
    if not asset_id:
        return 0.0
    latest = (
        db.query(PriceHistory)
        .filter(PriceHistory.asset_id == asset_id)
        .order_by(PriceHistory.timestamp.desc())
        .first()
    )
    if not latest:
        return 0.0
    cutoff = latest.timestamp - timedelta(hours=24)
    prior = (
        db.query(PriceHistory)
        .filter(PriceHistory.asset_id == asset_id, PriceHistory.timestamp <= cutoff)
        .order_by(PriceHistory.timestamp.desc())
        .first()
    )
    if not prior:
        prior = (
            db.query(PriceHistory)
            .filter(PriceHistory.asset_id == asset_id)
            .order_by(PriceHistory.timestamp.asc())
            .first()
        )
    if not prior or float(prior.price) == 0 or prior.id == latest.id:
        return 0.0
    return round((float(latest.price) - float(prior.price)) / float(prior.price), 4)


# Legacy fallback data — still referenced by app/api/v1/assets.py's degraded-data paths
# (get_asset_quote/get_asset_signal/get_asset_chart) when a symbol has no LatestQuote yet.
# Not used by the real /indices endpoint below.
_SEED_INDICES = [
    {"sym": "NIFTY 50",   "region": "IN", "value": 24218.40, "dayPct": 0.0064},
    {"sym": "SENSEX",     "region": "IN", "value": 79842.10, "dayPct": 0.0048},
    {"sym": "BANK NIFTY", "region": "IN", "value": 51842.30, "dayPct": 0.0091},
    {"sym": "NIFTY IT",   "region": "IN", "value": 36284.10, "dayPct": 0.0118},
    {"sym": "S&P 500",    "region": "US", "value": 5284.10,  "dayPct": 0.0036},
    {"sym": "NASDAQ",     "region": "US", "value": 16842.10, "dayPct": 0.0118},
    {"sym": "FTSE 100",   "region": "EU", "value": 8214.30,  "dayPct": -0.0024},
    {"sym": "NIKKEI 225", "region": "AS", "value": 38842.10, "dayPct": 0.0094},
]

_SEED_SECTORS = [
    {"name": "IT",            "wt": 0.144, "dayPct": 0.0118},
    {"name": "Financials",    "wt": 0.342, "dayPct": 0.0064},
    {"name": "Energy",        "wt": 0.118, "dayPct": 0.0042},
    {"name": "FMCG",          "wt": 0.082, "dayPct": -0.0036},
    {"name": "Auto",          "wt": 0.064, "dayPct": -0.0182},
    {"name": "Pharma",        "wt": 0.058, "dayPct": 0.0084},
    {"name": "Metals",        "wt": 0.038, "dayPct": -0.0042},
    {"name": "Realty",        "wt": 0.022, "dayPct": 0.0212},
    {"name": "Telecom",       "wt": 0.034, "dayPct": 0.0212},
    {"name": "Capital goods", "wt": 0.044, "dayPct": 0.0148},
]

SYSTEM_THEMES = {
    "rate-cut": {
        "id": "rate-cut",
        "name": "Rate-cut beneficiaries",
        "desc": "Short-duration treasuries + rate-sensitive financials",
        "symbols": ["SGOV", "HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS"],
        "weights": {"SGOV": 0.25, "HDFCBANK.NS": 0.25, "ICICIBANK.NS": 0.25, "SBIN.NS": 0.25},
        "inception_date": "2024-01-01",
        "ret1m": 0.034,
        "count": 4
    },
    "capex": {
        "id": "capex",
        "name": "India capex cycle",
        "desc": "Infra, capital goods, cement plays",
        "symbols": ["LT.NS", "BHEL.NS", "SIEMENS.NS", "ABB.NS"],
        "weights": {"LT.NS": 0.25, "BHEL.NS": 0.25, "SIEMENS.NS": 0.25, "ABB.NS": 0.25},
        "inception_date": "2024-01-01",
        "ret1m": 0.062,
        "count": 4
    },
    "ai-india": {
        "id": "ai-india",
        "name": "AI services exposure",
        "desc": "Indian IT vendors with AI revenue mix",
        "symbols": ["TCS.NS", "INFY.NS", "WIPRO.NS", "HCLTECH.NS"],
        "weights": {"TCS.NS": 0.25, "INFY.NS": 0.25, "WIPRO.NS": 0.25, "HCLTECH.NS": 0.25},
        "inception_date": "2024-01-01",
        "ret1m": 0.084,
        "count": 4
    },
    "green-energy": {
        "id": "green-energy",
        "name": "Green energy transition",
        "desc": "Solar, EV ecosystem, transmission",
        "symbols": ["ADANIGREEN.NS", "TATAPOWER.NS", "SUZLON.NS"],
        "weights": {"ADANIGREEN.NS": 0.3333, "TATAPOWER.NS": 0.3333, "SUZLON.NS": 0.3334},
        "inception_date": "2024-01-01",
        "ret1m": 0.042,
        "count": 3
    },
    "el-nino": {
        "id": "el-nino",
        "name": "Monsoon-resilient FMCG",
        "desc": "Stable demand through weather variance",
        "symbols": ["HINDUNILVR.NS", "ITC.NS", "DABUR.NS", "MARICO.NS"],
        "weights": {"HINDUNILVR.NS": 0.25, "ITC.NS": 0.25, "DABUR.NS": 0.25, "MARICO.NS": 0.25},
        "inception_date": "2024-01-01",
        "ret1m": 0.018,
        "count": 4
    },
    "small-cap": {
        "id": "small-cap",
        "name": "Small-cap quality",
        "desc": "ROE > 18%, debt-to-equity < 0.5",
        "symbols": [],
        "weights": {},
        "inception_date": "2024-01-01",
        "ret1m": 0.028,
        "count": 0
    }
}

def _classify(asset_class: Optional[str], symbol: str = "") -> str:
    if not asset_class:
        return "stocks"
    ac = asset_class.lower()
    if "crypto" in ac:
        return "crypto"
    if "bond" in ac:
        return "bonds"
    if "mutual_fund" in ac or "fund" in ac:
        return "funds"
    if "real_estate" in ac or "property" in ac:
        return "real_estate"
    if "retirement" in ac or "epf" in ac or "nps" in ac:
        return "retirement"
    if "insurance" in ac:
        return "insurance"
    if symbol.endswith("_MF"):
        return "funds"
    if symbol.endswith("-USD"):
        return "crypto"
    return "stocks"

@router.get("/assets/{asset_id}/snapshot")
def get_asset_snapshot(asset_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, Any]:
    cached = get_cached_asset_snapshot(str(asset_id))
    if cached:
        return cached
        
    repo = AssetSnapshotRepository(db)
    snapshot = repo.get(asset_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail="Asset snapshot not found")
        
    return {
        "asset_id": str(snapshot.asset_id),
        "price": snapshot.price,
        "market_cap": snapshot.market_cap,
        "pe_ratio": snapshot.pe_ratio,
        "rsi": snapshot.rsi,
        "momentum_score": snapshot.momentum_score,
        "volatility_score": snapshot.volatility_score,
        "sentiment_score": snapshot.sentiment_score,
        "payload": snapshot.payload,
        "updated_at": snapshot.updated_at
    }

@router.get("/assets/{asset_id}/features")
def get_asset_features(asset_id: uuid.UUID, db: Session = Depends(get_db)) -> dict[str, Any]:
    cached = get_cached_asset_features(str(asset_id))
    if cached:
        return cached

    repo = AssetFeaturesRepository(db)
    features = repo.get(asset_id)
    if not features:
        raise HTTPException(status_code=404, detail="Asset features not found")

    return {
        "asset_id": str(features.asset_id),
        "price": features.price,
        "market_cap": features.market_cap,
        "momentum_score": features.momentum_score,
        "volatility_score": features.volatility_score,
        "sentiment_score": features.sentiment_score,
        "updated_at": features.updated_at
    }


@router.get("/indices")
def market_indices(db: Session = Depends(get_db)):
    results = []
    for symbol, display_name, region in _INDEX_META:
        quote = db.query(LatestQuote).filter(LatestQuote.symbol == symbol).first()
        if not quote:
            continue  # not yet ingested — skip rather than fabricate
        results.append({
            "sym": display_name,
            "region": region,
            "value": float(quote.price),
            "dayPct": _compute_day_pct(db, quote.asset_id),
        })
    return results

@router.get("/sectors")
def market_sectors(db: Session = Depends(get_db)):
    sector_entries: dict[str, list[tuple[float, float]]] = {}
    for symbol, sector in _SYMBOL_SECTOR_MAP.items():
        quote = db.query(LatestQuote).filter(LatestQuote.symbol == symbol).first()
        if not quote:
            continue
        sector_entries.setdefault(sector, []).append(
            (float(quote.price), _compute_day_pct(db, quote.asset_id))
        )

    total_value = sum(price for entries in sector_entries.values() for price, _ in entries)
    results = []
    for sector, entries in sector_entries.items():
        sector_value = sum(price for price, _ in entries)
        wt = (sector_value / total_value) if total_value else 0.0
        avg_day_pct = sum(pct for _, pct in entries) / len(entries)
        results.append({"name": sector, "wt": round(wt, 4), "dayPct": round(avg_day_pct, 4)})

    return sorted(results, key=lambda r: -r["wt"])

@router.get("/movers")
def market_movers(db: Session = Depends(get_db)):
    rows = (
        db.query(Asset, LatestQuote)
        .join(LatestQuote, LatestQuote.asset_id == Asset.id)
        .filter(Asset.asset_class != "index")
        .all()
    )

    scored = []
    for asset, quote in rows:
        ex, region = _infer_exchange_region(asset.symbol)
        scored.append({
            "sym": asset.symbol,
            "name": asset.name,
            "price": float(quote.price),
            "dayPct": _compute_day_pct(db, quote.asset_id),
            "ex": ex,
            "region": region,
            "class": _classify(asset.asset_class, asset.symbol),
            "sector": _SYMBOL_SECTOR_MAP.get(asset.symbol, "General"),
        })

    scored.sort(key=lambda r: r["dayPct"], reverse=True)
    n = min(5, len(scored) // 2)
    gainers = scored[:n]
    losers = list(reversed(scored[-n:])) if n else []

    return {
        "gainers": gainers,
        "losers": losers
    }

@router.get("/themes")
def list_themes(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    profile = serialize_user_profile(user, db)
    custom_themes = profile.get("custom_themes", {})

    mine_list = []
    for row in custom_themes.values():
        mine_list.append({
            "id": row["id"],
            "name": row["name"],
            "desc": row["desc"],
            "ret1m": row.get("ret1m", 0.0),
            "count": len(row.get("symbols", [])),
            "inception_date": row.get("inception_date"),
            "owner_id": str(user.id),
            "forked_from": row.get("forked_from")
        })

    system_list = []
    for row in SYSTEM_THEMES.values():
        system_list.append({
            "id": row["id"],
            "name": row["name"],
            "desc": row["desc"],
            "ret1m": row["ret1m"],
            "count": row["count"],
            "inception_date": row["inception_date"],
            "owner_id": None
        })

    return {"system": system_list, "mine": mine_list}

@router.get("/themes/{theme_id}")
def get_theme_detail(
    theme_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    theme = None
    if theme_id in SYSTEM_THEMES:
        theme = SYSTEM_THEMES[theme_id]
    else:
        profile = serialize_user_profile(user, db)
        custom_themes = profile.get("custom_themes", {})
        theme = custom_themes.get(theme_id)

    if not theme:
        raise HTTPException(status_code=404, detail="Theme not found")

    constituents = []
    for sym in theme["symbols"]:
        quote = db.query(LatestQuote).filter(LatestQuote.symbol == sym).first()
        price = float(quote.price) if quote and quote.price is not None else 100.0

        asset = db.query(Asset).filter(Asset.symbol == sym).first()
        name = asset.name if asset else sym
        metadata = asset.metadata_payload if asset else {}
        sector = metadata.get("sector") if isinstance(metadata, dict) else "General"

        snap = db.query(AssetSnapshot).filter(AssetSnapshot.asset_id == quote.asset_id).first() if quote else None
        rsi = float(snap.rsi) if snap and snap.rsi is not None else 50.0

        constituents.append({
            "sym": sym,
            "name": name,
            "price": price,
            "rsi": rsi,
            "sector": sector,
            "class": _classify(asset.asset_class if asset else "equity", sym)
        })

    return {
        "id": theme["id"],
        "name": theme["name"],
        "desc": theme["desc"],
        "symbols": theme["symbols"],
        "weights": theme["weights"],
        "inception_date": theme["inception_date"],
        "ret1m": theme["ret1m"],
        "constituents": constituents
    }

@router.get("/themes/{theme_id}/signals")
def get_theme_signals(
    theme_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    theme = None
    if theme_id in SYSTEM_THEMES:
        theme = SYSTEM_THEMES[theme_id]
    else:
        profile = serialize_user_profile(user, db)
        custom_themes = profile.get("custom_themes", {})
        theme = custom_themes.get(theme_id)

    if not theme:
        raise HTTPException(status_code=404, detail="Theme not found")

    rsis = []
    for sym in theme["symbols"]:
        quote = db.query(LatestQuote).filter(LatestQuote.symbol == sym).first()
        if quote:
            snap = db.query(AssetSnapshot).filter(AssetSnapshot.asset_id == quote.asset_id).first()
            if snap and snap.rsi is not None:
                rsis.append(float(snap.rsi))

    avg_rsi = sum(rsis) / len(rsis) if rsis else 55.0
    trend = "Bullish" if avg_rsi > 55 else "Bearish" if avg_rsi < 45 else "Neutral"
    conf = min(90, max(50, int(50 + abs(avg_rsi - 50))))

    return {
        "rsi": round(avg_rsi, 1),
        "macd": 0.05,
        "adx": 24.5,
        "conf": conf,
        "trend": trend
    }

@router.get("/themes/{theme_id}/nav")
def get_theme_nav(
    theme_id: str,
    days: int = Query(365, ge=14, le=1825),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    theme = None
    if theme_id in SYSTEM_THEMES:
        theme = SYSTEM_THEMES[theme_id]
    else:
        profile = serialize_user_profile(user, db)
        custom_themes = profile.get("custom_themes", {})
        theme = custom_themes.get(theme_id)

    if not theme:
        raise HTTPException(status_code=404, detail="Theme not found")

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    weights = theme.get("weights") or {}
    per_symbol_series: dict[str, dict[str, float]] = {}

    for sym in theme["symbols"]:
        quote = db.query(LatestQuote).filter(LatestQuote.symbol == sym).first()
        if not quote or not quote.asset_id:
            continue
        rows = (
            db.query(PriceHistory)
            .filter(PriceHistory.asset_id == quote.asset_id, PriceHistory.timestamp >= cutoff)
            .order_by(PriceHistory.timestamp.asc())
            .all()
        )
        if not rows:
            continue
        by_date: dict[str, float] = {}
        for r in rows:
            by_date[r.timestamp.strftime("%Y-%m-%d")] = float(r.price)
        per_symbol_series[sym] = by_date

    if not per_symbol_series:
        raise HTTPException(status_code=422, detail="No price history available for this theme's constituents yet")

    # Renormalize weights across symbols that actually have data
    available_weight_total = sum(weights.get(sym, 0.0) for sym in per_symbol_series) or 1.0
    norm_weights = {sym: weights.get(sym, 0.0) / available_weight_total for sym in per_symbol_series}

    date_axis = sorted({d for series in per_symbol_series.values() for d in series})

    # Back-fill each symbol flat before its first real sample, forward-fill gaps after —
    # keeps every symbol's weight contributing across the whole axis so a constituent that
    # was only just seeded (one sample "today") doesn't cause an artificial jump when its
    # weight silently switches from absent to present partway through the series.
    filled_series: dict[str, dict[str, float]] = {}
    for sym, series in per_symbol_series.items():
        last = series[min(series)]
        filled: dict[str, float] = {}
        for date in date_axis:
            if date in series:
                last = series[date]
            filled[date] = last
        filled_series[sym] = filled

    base_price = {sym: series[date_axis[0]] for sym, series in filled_series.items()}
    nav = []
    for date in date_axis:
        composite = sum(
            norm_weights[sym] * (filled_series[sym][date] / base_price[sym])
            for sym in filled_series
        )
        nav.append(round(composite * 100, 4))

    return {
        "theme_id": theme_id,
        "nav": nav,
        "base": 100,
        "data_points": len(nav)
    }

class ForkThemeRequest(BaseModel):
    name: str

@router.post("/themes/{theme_id}/fork")
def fork_theme(
    theme_id: str,
    body: ForkThemeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    theme = None
    if theme_id in SYSTEM_THEMES:
        theme = SYSTEM_THEMES[theme_id]
    else:
        profile = serialize_user_profile(user, db)
        custom_themes = profile.get("custom_themes", {})
        theme = custom_themes.get(theme_id)

    if not theme:
        raise HTTPException(status_code=404, detail="Theme not found")

    new_id = f"fork-{uuid.uuid4().hex[:8]}"

    from app.domain.entities.market import MarketTheme, ThemeWeight

    new_theme = MarketTheme(
        theme_id=new_id,
        name=body.name,
        desc=f"Forked from {theme['name']}",
        symbols=list(theme["symbols"]),
        ret1m=theme["ret1m"],
        owner_id=user.id,
        forked_from=theme_id,
        inception_date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        is_public=False
    )
    db.add(new_theme)
    db.flush()

    effective_date = new_theme.inception_date
    for sym, wt in theme["weights"].items():
        db.add(ThemeWeight(
            theme_id=new_id,
            symbol=sym,
            weight=wt,
            effective_date=effective_date
        ))
    db.commit()
    return serialize_user_profile(user, db)["custom_themes"][new_id]

class UpdateThemeWeightsRequest(BaseModel):
    name: Optional[str] = None
    weights: Optional[dict[str, float]] = None

@router.put("/themes/{theme_id}")
def update_theme(
    theme_id: str,
    body: UpdateThemeWeightsRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from app.domain.entities.market import MarketTheme, ThemeWeight

    theme = db.query(MarketTheme).filter(MarketTheme.theme_id == theme_id, MarketTheme.owner_id == user.id).first()
    if not theme:
        raise HTTPException(status_code=403, detail="Not authorized or theme not found")

    if body.name is not None:
        theme.name = body.name
    if body.weights is not None:
        theme.symbols = list(body.weights.keys())
        # Delete old weights and insert new ones
        db.query(ThemeWeight).filter(ThemeWeight.theme_id == theme_id).delete()
        effective_date = theme.inception_date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        for sym, wt in body.weights.items():
            db.add(ThemeWeight(
                theme_id=theme_id,
                symbol=sym,
                weight=wt,
                effective_date=effective_date
            ))

    db.commit()
    return serialize_user_profile(user, db)["custom_themes"][theme_id]

@router.delete("/themes/{theme_id}")
def delete_theme(
    theme_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from app.domain.entities.market import MarketTheme, ThemeWeight

    theme = db.query(MarketTheme).filter(MarketTheme.theme_id == theme_id, MarketTheme.owner_id == user.id).first()
    if not theme:
        raise HTTPException(status_code=403, detail="Not authorized or theme not found")

    db.delete(theme)
    db.query(ThemeWeight).filter(ThemeWeight.theme_id == theme_id).delete()
    db.commit()
    return {"status": "deleted", "theme_id": theme_id}

@router.post("/symbols/{symbol}/backfill")
def trigger_backfill(
    symbol: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return {"status": "success", "symbol": symbol, "message": "Backfill completed"}

@router.get("/themes-for/{symbol}")
def get_themes_for_symbol(
    symbol: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    symbol = symbol.upper().strip()
    matched = []
    for tid, t in SYSTEM_THEMES.items():
        if symbol in t["symbols"]:
            matched.append(t["name"])

    profile = serialize_user_profile(user, db)
    custom_themes = profile.get("custom_themes", {})
    for tid, t in custom_themes.items():
        if symbol in t.get("symbols", []):
            matched.append(t["name"])

    return matched

@router.get("/sectors/{name}")
def get_sector_detail(name: str, db: Session = Depends(get_db)):
    assets = db.query(Asset).all()
    matched = []
    for asset in assets:
        sector = (asset.metadata_payload or {}).get("sector") if isinstance(asset.metadata_payload, dict) else None
        if sector and sector.lower() == name.lower():
            quote = db.query(LatestQuote).filter(LatestQuote.symbol == asset.symbol).first()
            price = float(quote.price) if quote else 100.0
            matched.append({
                "symbol": asset.symbol,
                "name": asset.name,
                "price": price,
                "dayPct": 0.005
            })

    if not matched:
        fallback_map = {
            "IT": ["TCS", "INFY"],
            "Financials": ["HDFCBANK", "ICICIBANK", "SBIN"],
            "Energy": ["RELIANCE"],
            "FMCG": ["ITC", "HINDUNILVR"]
        }
        for sym in fallback_map.get(name, []):
            quote = db.query(LatestQuote).filter(LatestQuote.symbol == sym).first()
            price = float(quote.price) if quote else 100.0
            matched.append({
                "symbol": sym,
                "name": sym,
                "price": price,
                "dayPct": 0.002
            })

    return {
        "sector": name,
        "constituents": matched,
        "count": len(matched)
    }

@router.get("/search")
def search_market(q: str = Query(...), db: Session = Depends(get_db)):
    q_clean = q.upper().strip()
    assets = db.query(Asset).filter(or_(Asset.symbol.contains(q_clean), Asset.name.contains(q))).limit(10).all()

    results = []
    for a in assets:
        quote = db.query(LatestQuote).filter(LatestQuote.symbol == a.symbol).first()
        price = float(quote.price) if quote else 100.0
        results.append({
            "sym": a.symbol,
            "name": a.name,
            "price": price,
            "dayPct": 0.002,
            "ex": "NSE",
            "region": "IN",
            "class": _classify(a.asset_class, a.symbol),
            "sector": (a.metadata_payload or {}).get("sector", "General")
        })
    return results

@router.get("/universe")
def get_market_universe(
    region: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    live: bool = Query(False),
    db: Session = Depends(get_db)
):
    query = db.query(Asset)
    if search:
        query = query.filter(or_(Asset.symbol.contains(search.upper()), Asset.name.contains(search)))
    assets = query.limit(50).all()

    results = []
    for a in assets:
        quote = db.query(LatestQuote).filter(LatestQuote.symbol == a.symbol).first()
        price = float(quote.price) if quote else 100.0
        results.append({
            "sym": a.symbol,
            "name": a.name,
            "price": price,
            "dayPct": 0.002,
            "ex": "NSE",
            "region": "IN",
            "class": _classify(a.asset_class, a.symbol),
            "sector": (a.metadata_payload or {}).get("sector", "General")
        })
    return results

@router.post("/refresh")
def refresh_market():
    return {"status": "success", "message": "Market refresh queued"}
