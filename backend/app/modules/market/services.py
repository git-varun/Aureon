"""Market data service.

Returns data from Redis cache (populated by the daily pipeline) and falls back
to seed defaults when the cache is cold. Seed data mirrors `marketData.js` so
the UI works from day one without a live feed.
"""

from __future__ import annotations

from typing import Any

from app.core.cache import cache
from app.shared.utils import cache_key

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
    if cached:
        return cached
    lookup = _universe_lookup()
    return {
        "gainers": [lookup[s] for s in _SEED_TOP_SYMBOLS["gainers"] if s in lookup],
        "losers":  [lookup[s] for s in _SEED_TOP_SYMBOLS["losers"]  if s in lookup],
    }


def get_themes() -> list[dict[str, Any]]:
    cached = cache.get(cache_key("market", "themes"))
    return cached if cached else _SEED_THEMES


def get_universe(region: str | None = None, search: str | None = None) -> list[dict[str, Any]]:
    cached = cache.get(cache_key("market", "universe"))
    universe: list[dict] = cached if cached else _SEED_UNIVERSE

    if region:
        universe = [a for a in universe if a.get("region", "").upper() == region.upper()]
    if search:
        q = search.lower()
        universe = [a for a in universe
                    if q in a.get("sym", "").lower() or q in a.get("name", "").lower()]
    return universe
