from enum import Enum


class Capability(str, Enum):
    """What a provider can do. A provider advertises a subset via its `capabilities()` method."""

    PRICE = "PRICE"
    OHLC = "OHLC"
    NEWS = "NEWS"
    FUNDAMENTALS = "FUNDAMENTALS"
    SEARCH = "SEARCH"
    PORTFOLIO = "PORTFOLIO"
    TRANSACTIONS = "TRANSACTIONS"
    HOLDINGS = "HOLDINGS"
    DIVIDENDS = "DIVIDENDS"
    CORPORATE_ACTIONS = "CORPORATE_ACTIONS"
    STATEMENTS = "STATEMENTS"
    AI_CHAT = "AI_CHAT"
    EMBEDDINGS = "EMBEDDINGS"
    VISION = "VISION"
    OCR = "OCR"
    ALERTS = "ALERTS"
    NOTIFICATIONS = "NOTIFICATIONS"
    STORAGE = "STORAGE"
    CURRENCY = "CURRENCY"
    TAX = "TAX"
    CALENDAR = "CALENDAR"
    RETIREMENT = "RETIREMENT"
