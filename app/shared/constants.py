"""Shared constants and enums."""

from enum import Enum


class AssetType(str, Enum):
    """Asset classification."""

    EQUITY = "equity"
    CRYPTO = "crypto"
    MUTUAL_FUND = "mutual_fund"
    COMMODITY = "commodity"


class SignalType(str, Enum):
    """Trading signal type."""

    BUY = "buy"
    SELL = "sell"
    HOLD = "hold"
    NEUTRAL = "neutral"


class TimeFrame(str, Enum):
    """Analysis timeframe."""

    INTRADAY = "intraday"
    SHORT_TERM = "short_term"  # < 1 month
    MEDIUM_TERM = "medium_term"  # 1-3 months
    LONG_TERM = "long_term"  # > 3 months


class AIStatus(str, Enum):
    """AI analysis status."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class TransactionType(str, Enum):
    """Transaction type."""

    BUY = "buy"
    SELL = "sell"
    DIVIDEND = "dividend"
    INTEREST = "interest"
    SPLIT = "split"
