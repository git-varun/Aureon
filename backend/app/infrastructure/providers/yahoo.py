import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import List

import yfinance as yf

from app.domain.services.providers.models import NormalizedNews, NormalizedQuote
from app.infrastructure.providers.base import ProviderAdapter

logger = logging.getLogger("providers.yahoo")


def _parse_yahoo_news_item(item: dict, provider_name: str) -> NormalizedNews | None:
    # Support both current format (item["content"]) and legacy flat format
    content = item.get("content") or item

    title = content.get("title")

    # URL: current format uses canonicalUrl.url, legacy uses link
    canonical = content.get("canonicalUrl") or {}
    url = canonical.get("url") or content.get("link")

    if not title or not url:
        return None

    # Timestamp: try pubDate/displayTime (ISO str) then providerPublishTime (unix int)
    published_at = None
    for field in ("pubDate", "displayTime"):
        raw = content.get(field)
        if raw:
            try:
                published_at = datetime.fromisoformat(raw.replace("Z", "+00:00"))
                break
            except (ValueError, AttributeError):
                logger.warning("Yahoo news: failed to parse timestamp field=%s value=%r", field, raw)

    if published_at is None:
        ts = content.get("providerPublishTime")
        if ts:
            try:
                published_at = datetime.fromtimestamp(int(ts), tz=timezone.utc)
            except (ValueError, OSError):
                logger.warning("Yahoo news: failed to parse providerPublishTime value=%r", ts)

    if published_at is None:
        published_at = datetime.now(timezone.utc)

    return NormalizedNews(
        provider=provider_name,
        title=title,
        url=url,
        published_at=published_at,
    )


class YahooAdapter(ProviderAdapter):
    @property
    def provider_name(self) -> str:
        return "yahoo"

    def get_quote(self, symbol: str) -> NormalizedQuote:
        ticker = yf.Ticker(symbol)
        info = ticker.info
        price = (
            info.get("currentPrice")
            or info.get("regularMarketPrice")
            or info.get("ask")
            or info.get("bid")
            or info.get("previousClose")
        )
        if not price:
            raise ValueError(f"No price returned by Yahoo Finance for symbol {symbol}")
        volume = info.get("regularMarketVolume") or info.get("volume") or 0
        return NormalizedQuote(
            symbol=symbol,
            provider=self.provider_name,
            timestamp=datetime.now(timezone.utc),
            price=Decimal(str(price)),
            volume=Decimal(str(volume)) if volume else None
        )

    def get_news(self, symbol: str) -> List[NormalizedNews]:
        ticker = yf.Ticker(symbol)
        results = []
        try:
            news_items = ticker.news or []
            received = len(news_items)
            skipped = 0
            for item in news_items:
                parsed = _parse_yahoo_news_item(item, self.provider_name)
                if parsed:
                    results.append(parsed)
                else:
                    skipped += 1
                    logger.warning("Yahoo news: skipped item missing title or url")
            logger.info(
                "Yahoo news: symbol=%s received=%d parsed=%d skipped=%d",
                symbol, received, len(results), skipped,
            )
        except Exception as e:
            logger.warning("Yahoo get_news failed for %s: %s", symbol, e)
        return results

    def health_check(self) -> bool:
        try:
            # Simple metadata lookup check
            yf.Ticker("AAPL").info
            return True
        except Exception:
            return False
