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

_BASE_URL = "https://api.twelvedata.com"

# Free tier: 8 API credits/minute — confirmed live (a 429 with "current limit
# being 8" after the 6th same-minute call), not taken from marketing copy.
# Non-US exchanges (HKEX, LSE, TSE) all rejected as Grow/Venture-plan-only on
# this tier too, so — same as Finnhub — this adapter has no real coverage
# outside US-listed symbols despite Twelve Data's docs suggesting otherwise.
_BUDGET_LIMIT = 8
_BUDGET_WINDOW_SECONDS = 60

_PERIOD_TO_OUTPUTSIZE = {"1mo": 22, "3mo": 66, "6mo": 132, "1y": 260, "2y": 520, "5y": 1300}


def _reject_india(provider_name: str, symbol: str) -> None:
    if symbol.endswith((".NS", ".BO")):
        raise ProviderError(f"{provider_name} is a global-equity provider — {symbol} should use nse_direct/yahoo")


class TwelveDataAdapter(MarketDataProvider):
    def __init__(self):
        self._api_key: str | None = settings.TWELVEDATA_API_KEY

    @property
    def provider_name(self) -> str:
        return "twelvedata"

    def capabilities(self) -> List[Capability]:
        return [Capability.PRICE, Capability.OHLC, Capability.FUNDAMENTALS]

    def authenticate(self, api_key: str | None = None, **_: str) -> None:
        if api_key:
            self._api_key = api_key

    def _resolved_key(self) -> str | None:
        return self._api_key or settings.TWELVEDATA_API_KEY

    def _check_budget(self) -> None:
        if not try_consume_provider_budget(self.provider_name, _BUDGET_LIMIT, _BUDGET_WINDOW_SECONDS):
            raise ProviderError(
                f"{self.provider_name}: local call budget ({_BUDGET_LIMIT}/{_BUDGET_WINDOW_SECONDS}s) "
                "exhausted for this window, skipping rather than draw a real 429"
            )

    def _raise_if_error_payload(self, data: dict, symbol: str) -> None:
        if data.get("status") == "error" or data.get("code"):
            raise ProviderError(f"Twelve Data error for {symbol}: {data.get('message')}")

    def get_quote(self, symbol: str) -> NormalizedQuote:
        _reject_india(self.provider_name, symbol)
        api_key = self._resolved_key()
        if not api_key:
            raise ConfigurationError("Twelve Data API key is not configured")
        self._check_budget()
        try:
            res = http_client.get(
                "TwelveData", f"{_BASE_URL}/quote",
                params={"symbol": symbol, "apikey": api_key},
                timeout=10
            )
            res.raise_for_status()
            data = res.json()
            self._raise_if_error_payload(data, symbol)
            price = data.get("close")
            if not price:
                raise ProviderError(f"No price returned from Twelve Data for symbol {symbol}")
            volume = data.get("volume")
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
            raise ProviderError(f"Twelve Data get_quote failed for {symbol}: {e}") from e

    def get_news(self, symbol: str) -> List[NormalizedNews]:
        raise ProviderError(f"{self.provider_name} does not support news")

    def get_fundamentals(self, symbol: str) -> dict[str, Any]:
        _reject_india(self.provider_name, symbol)
        api_key = self._resolved_key()
        if not api_key:
            raise ConfigurationError("Twelve Data API key is not configured")
        self._check_budget()
        try:
            res = http_client.get(
                "TwelveData", f"{_BASE_URL}/statistics",
                params={"symbol": symbol, "apikey": api_key},
                timeout=10
            )
            res.raise_for_status()
            data = res.json()
            self._raise_if_error_payload(data, symbol)
            val = (data.get("statistics") or {}).get("valuations_metrics") or {}
            return {
                "trailing_pe": val.get("trailing_pe"),
                "forward_pe": val.get("forward_pe"),
                "price_to_book": val.get("price_to_book_mrq"),
                "market_cap": val.get("market_capitalization"),
                "sector": (data.get("meta") or {}).get("sector"),
            }
        except ProviderError:
            raise
        except Exception as e:
            raise ProviderError(f"Twelve Data get_fundamentals failed for {symbol}: {e}") from e

    def get_price_history(self, symbol: str, period: str = "3mo", interval: str = "1d") -> list[dict[str, Any]]:
        _reject_india(self.provider_name, symbol)
        api_key = self._resolved_key()
        if not api_key:
            raise ConfigurationError("Twelve Data API key is not configured")
        if interval != "1d":
            raise ProviderError(f"{self.provider_name} only supports daily price history, got interval={interval}")
        self._check_budget()
        outputsize = _PERIOD_TO_OUTPUTSIZE.get(period, 66)
        try:
            res = http_client.get(
                "TwelveData", f"{_BASE_URL}/time_series",
                params={"symbol": symbol, "interval": "1day", "outputsize": outputsize, "apikey": api_key},
                timeout=15
            )
            res.raise_for_status()
            data = res.json()
            self._raise_if_error_payload(data, symbol)
            rows = []
            for v in data.get("values", []):
                close = v.get("close")
                if close is None:
                    continue
                ts = datetime.strptime(v["datetime"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
                volume = v.get("volume")
                rows.append({"timestamp": ts, "close": float(close), "volume": float(volume) if volume else None})
            return rows
        except ProviderError:
            raise
        except Exception as e:
            raise ProviderError(f"Twelve Data get_price_history failed for {symbol}: {e}") from e

    def health_check(self) -> bool:
        api_key = self._resolved_key()
        if not api_key:
            return False
        try:
            res = http_client.get(
                "TwelveData", f"{_BASE_URL}/quote",
                params={"symbol": "AAPL", "apikey": api_key},
                timeout=5
            )
            return res.status_code == 200
        except Exception:
            return False


registry.register(TwelveDataAdapter)
