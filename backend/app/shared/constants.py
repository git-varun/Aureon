"""Shared constants and enums."""

from enum import Enum


class AssetType(str, Enum):
    """Asset classification. Stored as VARCHAR(30) — add values freely."""

    EQUITY = "equity"
    CRYPTO = "crypto"
    MUTUAL_FUND = "mutual_fund"
    COMMODITY = "commodity"
    BOND = "bond"
    EPF = "epf"
    PPF = "ppf"
    INSURANCE = "insurance"
    REAL_ESTATE = "real_estate"


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


class SubType(str, Enum):
    """Fine-grained asset sub-classification."""

    # Crypto
    CRYPTO_SPOT = "crypto_spot"
    CRYPTO_EARN_FLEXIBLE = "crypto_earn_flexible"
    CRYPTO_EARN_LOCKED = "crypto_earn_locked"
    CRYPTO_FUTURES_LONG = "crypto_futures_long"
    CRYPTO_FUTURES_SHORT = "crypto_futures_short"
    CRYPTO_FUTURES_MARGIN = "crypto_futures_margin"
    CRYPTO_CASH = "crypto_cash"
    # Equity
    EQUITY_SPOT = "equity_spot"
    EQUITY_FO_LONG = "equity_fo_long"
    EQUITY_FO_SHORT = "equity_fo_short"
    # Mutual Fund
    MUTUAL_FUND = "mutual_fund"


class TransactionType(str, Enum):
    """Transaction type. Stored as VARCHAR(30) — add values freely."""

    BUY = "buy"
    SELL = "sell"
    DIVIDEND = "dividend"
    INTEREST = "interest"
    SPLIT = "split"
    CONTRIBUTION = "contribution"
    WITHDRAWAL = "withdrawal"
    PREMIUM = "premium"
    MATURITY = "maturity"
    ACCRUAL = "accrual"


class PriceSource(str, Enum):
    """How the current price is sourced."""

    MARKET = "market"
    NAV = "nav"
    ACCRUAL = "accrual"
    MANUAL = "manual"


class AssetTier(str, Enum):
    """Holding tier — how actively the asset is managed.

    Stored as VARCHAR(20). Drives Aureon's tier chip + signal eligibility.
    """

    ACTIVE = "active"  # equity, crypto — daily decisions
    SEMI = "semi"  # mutual_fund, bond — periodic rebalancing
    PASSIVE = "passive"  # epf, ppf, insurance, real_estate, commodity — illiquid


class SignalStatus(str, Enum):
    """Lifecycle state of a signal."""

    ACTIVE = "active"
    TRIGGERED = "triggered"
    EXPIRED = "expired"
    INVALIDATED = "invalidated"
