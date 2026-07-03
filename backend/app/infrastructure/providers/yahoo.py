"""Backward-compatible re-export. Canonical location:
app.infrastructure.providers.market_data.yahoo.provider
"""
from app.infrastructure.providers.market_data.yahoo.provider import (
    YahooAdapter,
    _parse_yahoo_news_item,
)

__all__ = ["YahooAdapter", "_parse_yahoo_news_item"]
