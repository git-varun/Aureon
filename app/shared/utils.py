"""Utility functions."""

import hashlib
from datetime import datetime, timedelta, timezone


def md5_hash(text: str) -> str:
    """Compute MD5 hash of text."""
    return hashlib.md5(text.encode()).hexdigest()


def cache_key(*parts) -> str:
    """Build cache key from parts."""
    return ":".join(str(p) for p in parts)


def retry_on_exception(func, max_attempts=3, delay=1):
    """Retry function with exponential backoff."""
    import time

    for attempt in range(max_attempts):
        try:
            return func()
        except Exception as e:
            if attempt == max_attempts - 1:
                raise
            time.sleep(delay * (2 ** attempt))


def add_days(date: datetime, days: int) -> datetime:
    """Add days to datetime."""
    return date + timedelta(days=days)


def days_ago(days: int) -> datetime:
    """Get datetime N days ago."""
    return datetime.now(timezone.utc) - timedelta(days=days)


def normalize_yf_symbol(symbol: str, asset_type: str, exchange: str = "NSE") -> str:
    """Convert internal symbol to yfinance format.
    NSE equities → SYMBOL.NS, BSE → SYMBOL.BO, crypto → SYMBOL-USD, others unchanged.
    Already-normalized symbols (e.g. RELIANCE.NS, BTC-USD) are returned as-is.
    """
    asset_type = (asset_type or "").upper()
    exchange = (exchange or "").upper()
    sym_upper = symbol.upper()

    if asset_type == "CRYPTO":
        # Already in yfinance crypto format (e.g. BTC-USD, ETH-USDT)
        if sym_upper.endswith("-USD") or sym_upper.endswith("-USDT"):
            return sym_upper
        # Compound Binance symbols: BTC-USD-EARN-FLEX, USDT-USD-FUTURES-MARGIN, etc.
        # Extract just the base coin — BTC-USD, USDT-USD — for price lookup.
        if "-USD-" in sym_upper:
            base = sym_upper.split("-USD-")[0]
            return f"{base}-USD"
        base = sym_upper.replace("USDT", "").replace("-", "")
        return f"{base}-USD"

    # Already has exchange suffix — don't double-append
    if symbol.endswith(".NS") or symbol.endswith(".BO"):
        return symbol

    if exchange == "BSE":
        return f"{symbol}.BO"

    # Default: treat as NSE equity
    return f"{symbol}.NS"
