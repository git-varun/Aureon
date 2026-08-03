from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, List

from app.core.config import settings
from app.core.exceptions import ConfigurationError, ProviderError
from app.core.logging.http import http_client
from app.core.providers.capabilities import Capability
from app.core.providers.interfaces import MarketDataProvider
from app.core.providers.registry import registry
from app.core.providers.models import NormalizedNews, NormalizedQuote
from app.core.redis import try_consume_provider_budget

_BASE_URL = "https://www.alphavantage.co/query"

# Free tier: 25 requests/day — confirmed live via the API's own rate-limit
# response text (not the marketing page), which also confirms the free tier
# has shrunk from the historically-cited 500/day. This is the tightest budget
# of any provider in the chain by a wide margin, so this adapter should only
# ever be reached when both finnhub and twelvedata have failed.
_BUDGET_LIMIT = 25
_BUDGET_WINDOW_SECONDS = 86400


def _reject_india(symbol: str) -> None:
    if symbol.endswith((".NS", ".BO")):
        raise ProviderError(f"alphavantage is a global-equity provider — {symbol} should use nse_direct/yahoo")


class AlphaVantageAdapter(MarketDataProvider):
    """TIME_SERIES_DAILY (the only historical endpoint this tier has access
    to — TIME_SERIES_DAILY_ADJUSTED is premium-gated, confirmed live) returns
    raw/unadjusted closes, same situation as NseDirectAdapter in Phase A: no
    free split/dividend-adjustment feed exists, so history is raw going
    forward with no back-adjustment of prior yahoo-sourced (adjusted) data.
    """

    def __init__(self):
        self._api_key: str | None = settings.ALPHAVANTAGE_API_KEY

    @property
    def provider_name(self) -> str:
        return "alphavantage"

    def capabilities(self) -> List[Capability]:
        return [Capability.PRICE, Capability.OHLC, Capability.FUNDAMENTALS]

    def authenticate(self, api_key: str | None = None, **_: str) -> None:
        if api_key:
            self._api_key = api_key

    def _resolved_key(self) -> str | None:
        return self._api_key or settings.ALPHAVANTAGE_API_KEY

    def _check_budget(self) -> None:
        if not try_consume_provider_budget(self.provider_name, _BUDGET_LIMIT, _BUDGET_WINDOW_SECONDS):
            raise ProviderError(
                f"{self.provider_name}: local call budget ({_BUDGET_LIMIT}/day) exhausted, "
                "skipping rather than draw a real rate-limit response"
            )

    def _get(self, params: dict, symbol: str) -> dict:
        api_key = self._resolved_key()
        if not api_key:
            raise ConfigurationError("Alpha Vantage API key is not configured")
        self._check_budget()
        res = http_client.get(
            "AlphaVantage", _BASE_URL,
            params={**params, "apikey": api_key},
            timeout=15
        )
        res.raise_for_status()
        data = res.json()
        if "Information" in data or "Error Message" in data or "Note" in data:
            raise ProviderError(f"Alpha Vantage error for {symbol}: {data.get('Information') or data.get('Error Message') or data.get('Note')}")
        return data

    def get_quote(self, symbol: str) -> NormalizedQuote:
        _reject_india(symbol)
        try:
            data = self._get({"function": "GLOBAL_QUOTE", "symbol": symbol}, symbol)
            quote = data.get("Global Quote") or {}
            price = quote.get("05. price")
            if not price:
                raise ProviderError(f"No price returned from Alpha Vantage for symbol {symbol}")
            volume = quote.get("06. volume")
            return NormalizedQuote(
                symbol=symbol,
                provider=self.provider_name,
                timestamp=datetime.now(timezone.utc),
                price=Decimal(str(price)),
                volume=Decimal(str(volume)) if volume else None,
            )
        except ProviderError:
            raise
        except Exception as e:
            raise ProviderError(f"Alpha Vantage get_quote failed for {symbol}: {e}") from e

    def get_news(self, symbol: str) -> List[NormalizedNews]:
        raise ProviderError(f"{self.provider_name} does not support news")

    def get_fundamentals(self, symbol: str) -> dict[str, Any]:
        _reject_india(symbol)
        try:
            data = self._get({"function": "OVERVIEW", "symbol": symbol}, symbol)
            if not data:
                raise ProviderError(f"No fundamentals returned from Alpha Vantage for symbol {symbol}")

            def _num(key: str) -> float | None:
                val = data.get(key)
                try:
                    return float(val) if val not in (None, "None", "-") else None
                except ValueError:
                    return None

            return {
                "trailing_pe": _num("PERatio"),
                "price_to_book": _num("PriceToBookRatio"),
                "roe": _num("ReturnOnEquityTTM"),
                "profit_margin": _num("ProfitMargin"),
                "dividend_yield": _num("DividendYield"),
                "market_cap": _num("MarketCapitalization"),
                "sector": data.get("Sector"),
                "industry": data.get("Industry"),
            }
        except ProviderError:
            raise
        except Exception as e:
            raise ProviderError(f"Alpha Vantage get_fundamentals failed for {symbol}: {e}") from e

    def get_price_history(self, symbol: str, period: str = "3mo", interval: str = "1d") -> list[dict[str, Any]]:
        _reject_india(symbol)
        if interval != "1d":
            raise ProviderError(f"{self.provider_name} only supports daily price history, got interval={interval}")
        try:
            outputsize = "full" if period in ("1y", "2y", "5y") else "compact"
            data = self._get({"function": "TIME_SERIES_DAILY", "symbol": symbol, "outputsize": outputsize}, symbol)
            series = data.get("Time Series (Daily)") or {}
            rows = []
            for date_str, ohlcv in series.items():
                close = ohlcv.get("4. close")
                if close is None:
                    continue
                ts = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                volume = ohlcv.get("5. volume")
                rows.append({"timestamp": ts, "close": float(close), "volume": float(volume) if volume else None})
            return rows
        except ProviderError:
            raise
        except Exception as e:
            raise ProviderError(f"Alpha Vantage get_price_history failed for {symbol}: {e}") from e

    def health_check(self) -> bool:
        api_key = self._resolved_key()
        if not api_key:
            return False
        try:
            res = http_client.get(
                "AlphaVantage", _BASE_URL,
                params={"function": "GLOBAL_QUOTE", "symbol": "AAPL", "apikey": api_key},
                timeout=8
            )
            return res.status_code == 200
        except Exception:
            return False


registry.register(AlphaVantageAdapter)
