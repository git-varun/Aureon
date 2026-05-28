"""Market data service.

Returns data from Redis cache (populated by the daily pipeline) and falls back
to seed defaults when the cache is cold. Seed data mirrors `marketData.js` so
the UI works from day one without a live feed.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from app.core.cache import cache
from app.shared.utils import cache_key

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Seed data — mirrors frontend/src/pages/aureon/marketData.js
# ---------------------------------------------------------------------------

_SEED_UNIVERSE: list[dict[str, Any]] = [
    {"sym": "RELIANCE",   "name": "Reliance Industries Ltd",    "ex": "NSE",    "region": "IN", "class": "stocks", "sector": "Energy",      "price": 2864.50, "dayPct": 0.0064,  "mcap": "19.4 L Cr"},
    {"sym": "TCS",        "name": "Tata Consultancy Services",  "ex": "NSE",    "region": "IN", "class": "stocks", "sector": "IT",           "price": 3942.20, "dayPct": -0.0024, "mcap": "14.3 L Cr"},
    {"sym": "INFY",       "name": "Infosys Ltd",                "ex": "NSE",    "region": "IN", "class": "stocks", "sector": "IT",           "price": 1486.80, "dayPct": 0.0118,  "mcap": "6.18 L Cr"},
    {"sym": "HDFCBANK",   "name": "HDFC Bank Ltd",              "ex": "NSE",    "region": "IN", "class": "stocks", "sector": "Financials",   "price": 1612.40, "dayPct": 0.0042,  "mcap": "12.2 L Cr"},
    {"sym": "ICICIBANK",  "name": "ICICI Bank Ltd",             "ex": "NSE",    "region": "IN", "class": "stocks", "sector": "Financials",   "price": 1124.30, "dayPct": 0.0091,  "mcap": "7.92 L Cr"},
    {"sym": "BHARTIARTL", "name": "Bharti Airtel Ltd",          "ex": "NSE",    "region": "IN", "class": "stocks", "sector": "Telecom",      "price": 1378.65, "dayPct": 0.0212,  "mcap": "8.21 L Cr"},
    {"sym": "ITC",        "name": "ITC Limited",                "ex": "NSE",    "region": "IN", "class": "stocks", "sector": "FMCG",         "price": 432.10,  "dayPct": -0.0036, "mcap": "5.41 L Cr"},
    {"sym": "LT",         "name": "Larsen & Toubro",            "ex": "NSE",    "region": "IN", "class": "stocks", "sector": "Industrials",  "price": 3614.80, "dayPct": 0.0083,  "mcap": "4.97 L Cr"},
    {"sym": "SBIN",       "name": "State Bank of India",        "ex": "NSE",    "region": "IN", "class": "stocks", "sector": "Financials",   "price": 842.55,  "dayPct": 0.0156,  "mcap": "7.52 L Cr"},
    {"sym": "TATAMOTORS", "name": "Tata Motors Ltd",            "ex": "NSE",    "region": "IN", "class": "stocks", "sector": "Auto",         "price": 982.40,  "dayPct": -0.0212, "mcap": "3.66 L Cr"},
    {"sym": "HINDUNILVR", "name": "Hindustan Unilever",         "ex": "NSE",    "region": "IN", "class": "stocks", "sector": "FMCG",         "price": 2412.30, "dayPct": -0.0048, "mcap": "5.66 L Cr"},
    {"sym": "ASIANPAINT", "name": "Asian Paints Ltd",           "ex": "NSE",    "region": "IN", "class": "stocks", "sector": "Materials",    "price": 2864.10, "dayPct": -0.0091, "mcap": "2.74 L Cr"},
    {"sym": "NIFTYBEES",  "name": "Nippon India Nifty 50 BeES", "ex": "NSE",    "region": "IN", "class": "funds",  "sector": "Index ETF",    "price": 268.40,  "dayPct": 0.0078,  "mcap": None},
    {"sym": "BANKBEES",   "name": "Nippon India Bank BeES",     "ex": "NSE",    "region": "IN", "class": "funds",  "sector": "Sector ETF",   "price": 512.80,  "dayPct": 0.0064,  "mcap": None},
    {"sym": "GOLDBEES",   "name": "Nippon India Gold BeES",     "ex": "NSE",    "region": "IN", "class": "funds",  "sector": "Commodity",    "price": 74.20,   "dayPct": 0.0042,  "mcap": None},
    {"sym": "PPFAS-FLEXI","name": "Parag Parikh Flexi Cap",     "ex": "MF",     "region": "IN", "class": "funds",  "sector": "Flexi Cap",    "price": 78.42,   "dayPct": 0.0036,  "mcap": None},
    {"sym": "QUANT-SMALL","name": "Quant Small Cap Fund",       "ex": "MF",     "region": "IN", "class": "funds",  "sector": "Small Cap",    "price": 248.40,  "dayPct": 0.0118,  "mcap": None},
    {"sym": "GSEC-10Y",   "name": "Govt of India 10-yr",        "ex": "NDS",    "region": "IN", "class": "bonds",  "sector": "Sovereign",    "price": 99.84,   "dayPct": -0.0008, "mcap": None},
    {"sym": "BTC-INR",    "name": "Bitcoin (INR)",              "ex": "BIN",    "region": "IN", "class": "crypto", "sector": "Layer 1",      "price": 5226336, "dayPct": -0.0182, "mcap": None},
    {"sym": "ETH-INR",    "name": "Ethereum (INR)",             "ex": "BIN",    "region": "IN", "class": "crypto", "sector": "Layer 1",      "price": 261414,  "dayPct": -0.0234, "mcap": None},
    {"sym": "NVDA",       "name": "NVIDIA Corporation",         "ex": "NASDAQ", "region": "US", "class": "stocks", "sector": "Tech",         "price": 865.42,  "dayPct": 0.0214,  "mcap": "$2.13T"},
    {"sym": "AAPL",       "name": "Apple Inc.",                 "ex": "NASDAQ", "region": "US", "class": "stocks", "sector": "Tech",         "price": 228.74,  "dayPct": -0.0042, "mcap": "$3.48T"},
    {"sym": "MSFT",       "name": "Microsoft Corp.",            "ex": "NASDAQ", "region": "US", "class": "stocks", "sector": "Tech",         "price": 434.18,  "dayPct": 0.0118,  "mcap": "$3.22T"},
    {"sym": "TSLA",       "name": "Tesla Inc.",                 "ex": "NASDAQ", "region": "US", "class": "stocks", "sector": "Auto",         "price": 248.50,  "dayPct": -0.0212, "mcap": "$786B"},
]

_SEED_INDICES: list[dict[str, Any]] = [
    {"sym": "NIFTY 50",   "region": "IN", "value": 24218.40, "dayPct": 0.0064},
    {"sym": "SENSEX",     "region": "IN", "value": 79842.10, "dayPct": 0.0048},
    {"sym": "BANK NIFTY", "region": "IN", "value": 51842.30, "dayPct": 0.0091},
    {"sym": "NIFTY IT",   "region": "IN", "value": 36284.10, "dayPct": 0.0118},
    {"sym": "S&P 500",    "region": "US", "value": 5284.10,  "dayPct": 0.0036},
    {"sym": "NASDAQ",     "region": "US", "value": 16842.10, "dayPct": 0.0118},
    {"sym": "FTSE 100",   "region": "EU", "value": 8214.30,  "dayPct": -0.0024},
    {"sym": "NIKKEI 225", "region": "AS", "value": 38842.10, "dayPct": 0.0094},
]

_SEED_SECTORS: list[dict[str, Any]] = [
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

_SEED_THEMES: list[dict[str, Any]] = [
    {"id": "rate-cut",    "name": "Rate-cut beneficiaries", "desc": "Long-duration bonds + rate-sensitive sectors", "count": 14, "ret1m": 0.034},
    {"id": "capex",       "name": "India capex cycle",      "desc": "Infra, capital goods, cement plays",           "count": 18, "ret1m": 0.062},
    {"id": "ai-india",    "name": "AI services exposure",   "desc": "Indian IT vendors with AI revenue mix",        "count": 8,  "ret1m": 0.084},
    {"id": "green-energy","name": "Green energy transition","desc": "Solar, EV ecosystem, transmission",            "count": 12, "ret1m": 0.042},
    {"id": "el-nino",     "name": "Monsoon-resilient FMCG", "desc": "Stable demand through weather variance",       "count": 9,  "ret1m": 0.018},
    {"id": "small-cap",   "name": "Small-cap quality",      "desc": "ROE > 18%, debt-to-equity < 0.5",             "count": 24, "ret1m": 0.028},
]

_SEED_TOP_SYMBOLS = {"gainers": ["BHARTIARTL", "SBIN", "INFY", "LT", "ICICIBANK"],
                     "losers":  ["TATAMOTORS", "ASIANPAINT", "HINDUNILVR", "ITC", "TCS"]}


def _universe_lookup() -> dict[str, dict]:
    return {a["sym"]: a for a in _SEED_UNIVERSE}


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------

def get_indices() -> list[dict[str, Any]]:
    cached = cache.get(cache_key("market", "indices"))
    return cached if cached else _SEED_INDICES


def get_sectors() -> list[dict[str, Any]]:
    cached = cache.get(cache_key("market", "sectors"))
    return cached if cached else _SEED_SECTORS


def get_movers() -> dict[str, Any]:
    cached = cache.get(cache_key("market", "movers"))
    if cached and (cached.get("gainers") or cached.get("losers")):
        return cached
    lookup = _universe_lookup()
    return {
        "gainers": [lookup[s] for s in _SEED_TOP_SYMBOLS["gainers"] if s in lookup],
        "losers":  [lookup[s] for s in _SEED_TOP_SYMBOLS["losers"]  if s in lookup],
    }


def get_themes(user_id: int | None = None) -> dict[str, Any]:
    """Return system themes and (optionally) the calling user's forked themes."""
    import json as _json
    from app.core.db import SessionLocal
    from app.modules.market.models import MarketTheme

    cached = cache.get(cache_key("market", "themes"))
    system_list: list[dict] = cached if cached else _SEED_THEMES

    # Ensure each system entry has the expected keys
    system_themes = []
    for t in system_list:
        system_themes.append({
            "id": t.get("id", t.get("theme_id", "")),
            "name": t.get("name", ""),
            "desc": t.get("desc", ""),
            "ret1m": t.get("ret1m", 0.0),
            "count": t.get("count", 0),
            "inception_date": t.get("inception_date"),
            "owner_id": None,
        })

    user_themes: list[dict] = []
    if user_id:
        try:
            with SessionLocal() as db:
                rows = db.query(MarketTheme).filter_by(owner_id=user_id).all()
                for row in rows:
                    syms = _json.loads(row.symbols or "[]")
                    user_themes.append({
                        "id": row.theme_id,
                        "name": row.name,
                        "desc": row.desc,
                        "ret1m": row.ret1m or 0.0,
                        "count": len(syms),
                        "inception_date": row.inception_date.isoformat() if row.inception_date else None,
                        "owner_id": row.owner_id,
                        "forked_from": row.forked_from,
                    })
        except Exception as exc:
            logger.warning("get_themes user query failed: %s", exc)

    return {"system": system_themes, "mine": user_themes}


_DEFAULT_THEMES = [
    {"theme_id": "rate-cut", "name": "Rate-cut beneficiaries", "desc": "Long-duration bonds + rate-sensitive sectors",
     "symbols": ["GSEC-10Y", "HDFCBANK", "ICICIBANK", "SBIN"]},
    {"theme_id": "capex", "name": "India capex cycle", "desc": "Infra, capital goods, cement plays",
     "symbols": ["LT", "BHEL", "SIEMENS", "ABB"]},
    {"theme_id": "ai-india", "name": "AI services exposure", "desc": "Indian IT vendors with AI revenue mix",
     "symbols": ["TCS", "INFY", "WIPRO", "HCLTECH"]},
    {"theme_id": "green-energy", "name": "Green energy transition", "desc": "Solar, EV ecosystem, transmission",
     "symbols": ["ADANIGREEN", "TATAPOWER", "SUZLON"]},
    {"theme_id": "el-nino", "name": "Monsoon-resilient FMCG", "desc": "Stable demand through weather variance",
     "symbols": ["HINDUNILVR", "ITC", "DABUR", "MARICO"]},
    {"theme_id": "small-cap", "name": "Small-cap quality", "desc": "ROE > 18%, debt-to-equity < 0.5", "symbols": []},
]


def seed_themes(db: Session) -> None:
    """Idempotently insert default market themes (runs at startup)."""
    import json
    from app.modules.market.models import MarketTheme
    for t in _DEFAULT_THEMES:
        exists = db.query(MarketTheme).filter_by(theme_id=t["theme_id"]).first()
        if not exists:
            db.add(MarketTheme(
                theme_id=t["theme_id"],
                name=t["name"],
                desc=t["desc"],
                symbols=json.dumps(t["symbols"]),
                ret1m=0.0,
            ))
    db.commit()


def get_theme_detail(theme_id: str) -> dict[str, Any] | None:
    """Return a single theme with constituent details cross-referenced against the universe."""
    import json

    # Try live cache first
    themes_cached = cache.get(cache_key("market", "themes"))
    themes: list[dict] = themes_cached if themes_cached else _SEED_THEMES
    theme = next((t for t in themes if t.get("id", t.get("theme_id")) == theme_id), None)
    if not theme:
        # Fall through to DB lookup for user-owned / forked themes
        try:
            from app.core.db import SessionLocal
            from app.modules.market.models import MarketTheme
            with SessionLocal() as _db:
                row = _db.query(MarketTheme).filter_by(theme_id=theme_id).first()
                if not row:
                    return None
                theme = {
                    "id": row.theme_id,
                    "name": row.name,
                    "desc": row.desc,
                    "ret1m": row.ret1m or 0.0,
                    "count": len(json.loads(row.symbols or "[]")),
                }
        except Exception:
            return None

    # Normalize id field
    theme = dict(theme)
    if "theme_id" in theme and "id" not in theme:
        theme["id"] = theme["theme_id"]

    # Resolve constituent symbols
    sym_map = _universe_lookup()
    default_sym_map = {t["theme_id"]: t["symbols"] for t in _DEFAULT_THEMES}
    symbols: list[str] = default_sym_map.get(theme_id, [])

    # Try DB for richer symbol list
    try:
        from app.core.db import SessionLocal
        from app.modules.market.models import MarketTheme
        db = SessionLocal()
        try:
            row = db.query(MarketTheme).filter_by(theme_id=theme_id).first()
            if row and row.symbols:
                db_syms = json.loads(row.symbols)
                if db_syms:
                    symbols = db_syms
        finally:
            db.close()
    except Exception:
        pass

    # Check which symbols have price history
    history_set: set[str] = set()
    try:
        from app.modules.portfolio.models import Asset, PriceHistory
        from sqlalchemy import func as _func
        db2 = SessionLocal()
        try:
            assets_with_history = (
                db2.query(Asset.symbol)
                .join(PriceHistory, PriceHistory.asset_id == Asset.id)
                .group_by(Asset.symbol)
                .having(_func.count(PriceHistory.id) >= 1)
                .all()
            )
            history_set = {r.symbol for r in assets_with_history}
        finally:
            db2.close()
    except Exception:
        pass

    # Load weight data for constituents
    weight_map: dict[str, float] = {}
    try:
        from app.modules.market.models import ThemeWeight
        from sqlalchemy import func as _func2
        db3 = SessionLocal()
        try:
            latest_eff = (
                db3.query(_func2.max(ThemeWeight.effective_date))
                .filter(ThemeWeight.theme_id == theme_id)
                .scalar()
            )
            if latest_eff:
                tw_rows = (
                    db3.query(ThemeWeight)
                    .filter(ThemeWeight.theme_id == theme_id, ThemeWeight.effective_date == latest_eff)
                    .all()
                )
                weight_map = {r.symbol: r.weight for r in tw_rows}
        finally:
            db3.close()
    except Exception:
        pass

    if not weight_map and symbols:
        w = round(1.0 / len(symbols), 4)
        weight_map = {s: w for s in symbols}

    constituents = []
    for sym in symbols:
        asset = sym_map.get(sym)
        base = {
            "sym": sym,
            "name": sym,
            "sector": "",
            "ex": "",
            "region": "IN",
            "price": None,
            "dayPct": None,
            "mcap": None,
            "class": "stocks",
            "weight": weight_map.get(sym),
            "has_history": sym in history_set,
        }
        if asset:
            base.update({
                "name": asset["name"],
                "sector": asset.get("sector", ""),
                "ex": asset.get("ex", ""),
                "region": asset.get("region", "IN"),
                "price": asset.get("price", 0),
                "dayPct": asset.get("dayPct", 0),
                "mcap": asset.get("mcap"),
                "class": asset.get("class", "stocks"),
            })
        constituents.append(base)

    theme["constituents"] = constituents
    theme["count"] = theme.get("count", len(constituents))

    # Add ownership / fork metadata if available from DB
    try:
        from app.modules.market.models import MarketTheme as _MT
        db4 = SessionLocal()
        try:
            row = db4.query(_MT).filter_by(theme_id=theme_id).first()
            if row:
                theme["owner_id"] = row.owner_id
                theme["forked_from"] = row.forked_from
                theme["inception_date"] = row.inception_date.isoformat() if row.inception_date else None
                theme["is_public"] = row.is_public
        finally:
            db4.close()
    except Exception:
        pass

    return theme


def fork_theme(theme_id: str, new_name: str, user_id: int) -> dict[str, Any] | None:
    """Fork a system (or any) theme into a user-owned copy."""
    import json
    import uuid
    from datetime import date

    from app.core.db import SessionLocal
    from app.modules.market.models import MarketTheme, ThemeWeight
    from sqlalchemy import func

    with SessionLocal() as db:
        source = db.query(MarketTheme).filter_by(theme_id=theme_id).first()
        if not source:
            return None

        today = date.today()
        new_id = f"user-{user_id}-fork-{theme_id}-{uuid.uuid4().hex[:6]}"

        new_theme = MarketTheme(
            theme_id=new_id,
            name=new_name or f"My {source.name}",
            desc=source.desc,
            symbols=source.symbols,
            ret1m=source.ret1m or 0.0,
            owner_id=user_id,
            forked_from=theme_id,
            inception_date=today,
            is_public=False,
        )
        db.add(new_theme)
        db.flush()

        # Copy latest weight snapshot
        latest_eff = (
            db.query(func.max(ThemeWeight.effective_date))
            .filter(ThemeWeight.theme_id == theme_id)
            .scalar()
        )

        if latest_eff:
            src_weights = (
                db.query(ThemeWeight)
                .filter(ThemeWeight.theme_id == theme_id, ThemeWeight.effective_date == latest_eff)
                .all()
            )
            for tw in src_weights:
                db.add(ThemeWeight(
                    theme_id=new_id,
                    symbol=tw.symbol,
                    weight=tw.weight,
                    effective_date=today,
                    mcap_at_set=tw.mcap_at_set,
                ))
        else:
            # Equal-weight from symbols JSON
            syms = json.loads(source.symbols or "[]")
            if syms:
                w = round(1.0 / len(syms), 6)
                for sym in syms:
                    db.add(ThemeWeight(
                        theme_id=new_id,
                        symbol=sym,
                        weight=w,
                        effective_date=today,
                    ))

        db.commit()

        # Queue backfill for any constituent missing price history
        try:
            from app.modules.portfolio.models import Asset, PriceHistory
            from app.tasks.market import backfill_symbol_task
            syms = json.loads(source.symbols or "[]")
            for sym in syms:
                asset = db.query(Asset).filter_by(symbol=sym).first()
                needs_backfill = True
                if asset:
                    cnt = db.query(PriceHistory).filter_by(asset_id=asset.id).count()
                    needs_backfill = cnt < 100
                if needs_backfill:
                    backfill_symbol_task.delay(sym, user_id)
        except Exception as bf_exc:
            logger.warning("fork_theme backfill queue failed: %s", bf_exc)

    return get_theme_detail(new_id)


def update_theme(theme_id: str, user_id: int, name: str | None = None, weights: dict | None = None) -> dict[str, Any] | None:
    """Update name and/or weights of a user-owned theme."""
    import json
    from datetime import date

    from app.core.db import SessionLocal
    from app.modules.market.models import MarketTheme, ThemeWeight

    with SessionLocal() as db:
        theme = db.query(MarketTheme).filter_by(theme_id=theme_id).first()
        if not theme or theme.owner_id != user_id:
            return None

        if name:
            theme.name = name

        if weights:
            total = sum(weights.values())
            if abs(total - 1.0) > 0.001:
                raise ValueError(f"Weights must sum to 1.0, got {total:.4f}")

            today = date.today()
            # Delete any same-day snapshot to allow re-save
            db.query(ThemeWeight).filter_by(theme_id=theme_id, effective_date=today).delete()
            for sym, w in weights.items():
                db.add(ThemeWeight(
                    theme_id=theme_id,
                    symbol=sym,
                    weight=w,
                    effective_date=today,
                ))
            # Update symbols JSON for legacy compatibility
            theme.symbols = json.dumps(list(weights.keys()))

        db.commit()

    return get_theme_detail(theme_id)


def delete_theme(theme_id: str, user_id: int) -> bool:
    """Delete a user-owned theme and its weight history."""
    from app.core.db import SessionLocal
    from app.modules.market.models import MarketTheme, ThemeWeight

    with SessionLocal() as db:
        theme = db.query(MarketTheme).filter_by(theme_id=theme_id).first()
        if not theme or theme.owner_id != user_id:
            return False
        db.query(ThemeWeight).filter_by(theme_id=theme_id).delete()
        db.delete(theme)
        db.commit()

    return True


def get_themes_for_symbol(symbol: str) -> list[dict[str, Any]]:
    """Return all themes that contain the given symbol."""
    import json
    sym_upper = symbol.upper()

    # Build lookup from DB or defaults
    themes_with_symbols: list[dict] = []
    try:
        from app.core.db import SessionLocal
        from app.modules.market.models import MarketTheme
        db = SessionLocal()
        try:
            rows = db.query(MarketTheme).all()
            for row in rows:
                syms = json.loads(row.symbols) if row.symbols else []
                themes_with_symbols.append({
                    "id": row.theme_id, "name": row.name, "desc": row.desc,
                    "ret1m": row.ret1m or 0.0, "symbols": syms,
                })
        finally:
            db.close()
    except Exception:
        pass

    if not themes_with_symbols:
        for t in _DEFAULT_THEMES:
            themes_with_symbols.append({
                "id": t["theme_id"], "name": t["name"], "desc": t["desc"],
                "ret1m": 0.0, "symbols": t["symbols"],
            })

    result = []
    for t in themes_with_symbols:
        if sym_upper in [s.upper() for s in t.get("symbols", [])]:
            result.append({"id": t["id"], "name": t["name"], "desc": t["desc"], "ret1m": t["ret1m"]})
    return result


def get_sector_detail(name: str) -> dict[str, Any] | None:
    """Return sector metadata with constituent stocks from the universe."""
    cached_sectors: list[dict] = cache.get(cache_key("market", "sectors")) or []
    all_sectors = cached_sectors if cached_sectors else _SEED_SECTORS
    sector = next((s for s in all_sectors if s["name"].lower() == name.lower()), None)
    if not sector:
        sector = next((s for s in _SEED_SECTORS if s["name"].lower() == name.lower()), None)
    if not sector:
        return None

    universe: list[dict] = cache.get(cache_key("market", "universe")) or _SEED_UNIVERSE
    constituents = [
        {
            "sym": a["sym"], "name": a["name"], "sector": a.get("sector", ""),
            "ex": a.get("ex", ""), "region": a.get("region", "IN"),
            "price": a.get("price", 0), "dayPct": a.get("dayPct", 0),
            "mcap": a.get("mcap"), "class": a.get("class", "stocks"),
            "weight": None,
        }
        for a in universe
        if a.get("sector", "").lower() == sector["name"].lower()
    ]

    # Equal-weight if no explicit weights
    if constituents:
        w = round(1.0 / len(constituents), 4)
        for c in constituents:
            c["weight"] = w

    return {
        "id": f"sector-{sector['name'].lower().replace(' ', '-')}",
        "name": sector["name"],
        "desc": f"{sector['name']} sector · NIFTY universe",
        "wt": sector.get("wt", 0),
        "dayPct": sector.get("dayPct", 0),
        "ret1m": round(sector.get("dayPct", 0) * 20, 4),
        "count": len(constituents),
        "constituents": constituents,
        "fundamentals": {},
        "is_sector": True,
    }


def search_yfinance(query: str, max_results: int = 10) -> list[dict[str, Any]]:
    """Search for any financial symbol via yfinance and return universe-compatible dicts."""
    if not query or not query.strip():
        return []

    try:
        import yfinance as yf
    except ImportError:
        logger.warning("yfinance not installed")
        return []

    results: list[dict] = []
    try:
        ticker = yf.Ticker(query.strip().upper())
        info = ticker.info or {}
        fast = ticker.fast_info if hasattr(ticker, "fast_info") else {}

        name = info.get("longName") or info.get("shortName") or query.upper()
        price = getattr(fast, "last_price", None) or info.get("regularMarketPrice") or info.get("previousClose") or 0
        day_pct = 0.0
        if info.get("regularMarketPrice") and info.get("regularMarketPreviousClose"):
            prev = info["regularMarketPreviousClose"]
            day_pct = (info["regularMarketPrice"] - prev) / prev if prev else 0.0

        exchange = info.get("exchange", "")
        currency = info.get("currency", "USD")
        region = "IN" if currency in ("INR",) or exchange in ("NSE", "BSE") else "US"
        asset_class = "crypto" if info.get("quoteType") == "CRYPTOCURRENCY" else \
                      "funds" if info.get("quoteType") in ("ETF", "MUTUALFUND") else "stocks"
        sector = info.get("sector", "")
        mcap = info.get("marketCap")
        if mcap:
            if mcap >= 1e12:
                mcap = f"${mcap / 1e12:.2f}T"
            elif mcap >= 1e9:
                mcap = f"${mcap / 1e9:.2f}B"
            else:
                mcap = f"${mcap / 1e6:.0f}M"

        results.append({
            "sym": query.strip().upper(),
            "name": name,
            "ex": exchange,
            "region": region,
            "class": asset_class,
            "sector": sector,
            "price": price,
            "dayPct": day_pct,
            "mcap": mcap,
            "spark": [],
            "source": "yfinance",
        })
    except Exception as exc:
        logger.warning("yfinance search failed for %s: %s", query, exc)

    return results


def get_universe(region: str | None = None, search: str | None = None, live: bool = False) -> list[dict[str, Any]]:
    cached = cache.get(cache_key("market", "universe"))
    universe: list[dict] = cached if cached else _SEED_UNIVERSE

    if region:
        universe = [a for a in universe if a.get("region", "").upper() == region.upper()]
    if search:
        q = search.lower()
        local = [a for a in universe
                 if q in a.get("sym", "").lower() or q in a.get("name", "").lower()]
        if local:
            return local
        # No local match — try yfinance for the exact symbol
        if live:
            return search_yfinance(search)
    return universe
