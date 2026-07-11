from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, List

import numpy as np
import pandas as pd
import yfinance as yf

from app.core.logging import logger
from app.core.providers.capabilities import Capability
from app.core.providers.interfaces import MarketDataProvider
from app.core.providers.registry import registry
from app.core.providers.models import NormalizedNews, NormalizedQuote


def _calculate_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    up = delta.clip(lower=0)
    down = -delta.clip(upper=0)

    ema_up = up.ewm(com=period - 1, adjust=False).mean()
    ema_down = down.ewm(com=period - 1, adjust=False).mean()

    rs = ema_up / ema_down
    return 100 - (100 / (1 + rs))


def _calculate_macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> tuple[pd.Series, pd.Series, pd.Series]:
    exp1 = series.ewm(span=fast, adjust=False).mean()
    exp2 = series.ewm(span=slow, adjust=False).mean()
    macd_line = exp1 - exp2
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    return macd_line, signal_line, macd_line - signal_line


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
                logger.warning(f"Yahoo news: failed to parse timestamp field={field} value={raw!r}")

    if published_at is None:
        ts = content.get("providerPublishTime")
        if ts:
            try:
                published_at = datetime.fromtimestamp(int(ts), tz=timezone.utc)
            except (ValueError, OSError):
                logger.warning(f"Yahoo news: failed to parse providerPublishTime value={ts!r}")

    if published_at is None:
        published_at = datetime.now(timezone.utc)

    return NormalizedNews(
        provider=provider_name,
        title=title,
        url=url,
        published_at=published_at,
    )


class YahooAdapter(MarketDataProvider):
    @property
    def provider_name(self) -> str:
        return "yahoo"

    def capabilities(self) -> List[Capability]:
        return [Capability.PRICE, Capability.NEWS, Capability.SEARCH]

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
                f"Yahoo news symbol={symbol} received={received} parsed={len(results)} skipped={skipped}"
            )
        except Exception as e:
            logger.warning(f"Yahoo get_news failed for {symbol}: {e}")
        return results

    def get_technical_indicators(self, symbol: str) -> dict[str, Any]:
        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period="1mo")
            if not hist.empty and len(hist) >= 14:
                closes = hist["Close"]

                rsi_series = _calculate_rsi(closes)
                rsi_val = float(rsi_series.iloc[-1])
                if np.isnan(rsi_val):
                    rsi_val = None

                macd_line, signal_line, _ = _calculate_macd(closes)
                macd_val = float(macd_line.iloc[-1])
                macd_sig = float(signal_line.iloc[-1])

                returns = closes.pct_change().dropna()
                volatility_val = float(returns.std()) if not returns.empty else None

                action = "SELL" if (rsi_val or 50) > 70 else "BUY" if (rsi_val or 50) < 30 else "HOLD"
                trend = "Overbought" if (rsi_val or 50) > 70 else "Oversold" if (rsi_val or 50) < 30 else "Neutral"

                news = ticker.news
                latest_news_ts = 0
                for item in news:
                    ts = item.get("providerPublishTime") or item.get("publishTime") or item.get("published_at")
                    if ts:
                        try:
                            latest_news_ts = max(latest_news_ts, int(ts))
                        except Exception:
                            pass

                news_ts = latest_news_ts if latest_news_ts > 0 else (int(datetime.now(timezone.utc).timestamp()) if news else None)

                return {
                    "rsi": rsi_val,
                    "macd": macd_val,
                    "macd_signal": macd_sig,
                    "volatility": volatility_val,
                    "sentiment": None,
                    "action": action,
                    "trend": trend,
                    "source": "yfinance",
                    "news_timestamp": news_ts,
                }
        except Exception as e:
            logger.warning(f"Failed to compute indicators for {symbol}: {e}")

        return {
            "rsi": None, "macd": None, "macd_signal": None,
            "volatility": None, "sentiment": None,
            "action": None, "trend": None,
            "source": "unavailable", "news_timestamp": None,
        }

    def health_check(self) -> bool:
        try:
            # Simple metadata lookup check
            yf.Ticker("AAPL").info
            return True
        except Exception:
            return False


registry.register(YahooAdapter)
