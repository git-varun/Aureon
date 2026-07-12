from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, List

import pandas as pd

from app.core.binance import WALLET_SUFFIXES
from app.core.exceptions import ProviderError
from app.core.logging.http import http_client
from app.core.providers.capabilities import Capability
from app.core.providers.interfaces import MarketDataProvider
from app.core.providers.registry import registry
from app.core.providers.models import NormalizedNews, NormalizedQuote
from app.modules.market.providers.market_data.yahoo.provider import _calculate_macd, _calculate_rsi

_FAPI_URL = "https://fapi.binance.com"
_DAPI_URL = "https://dapi.binance.com"
_BASE_URL_BY_SUFFIX = {WALLET_SUFFIXES["futures_usdm"]: _FAPI_URL, WALLET_SUFFIXES["futures_coinm"]: _DAPI_URL}


def _split_futures_symbol(symbol: str) -> tuple[str, str]:
    """"BTCUSDT-USDM" -> ("BTCUSDT", fapi base); "BTCUSD_PERP-COINM" -> ("BTCUSD_PERP", dapi base)."""
    for suffix, base_url in _BASE_URL_BY_SUFFIX.items():
        if symbol.endswith(f"-{suffix}"):
            return symbol[: -(len(suffix) + 1)], base_url
    raise ValueError(f"Not a recognized Binance futures symbol: {symbol}")


class BinanceFuturesMarketDataProvider(MarketDataProvider):
    """PRICE/OHLC for Binance USDⓈ-M and COIN-M perpetual futures — Yahoo Finance
    has no tickers for these, so futures Positions (see PortfolioService) are
    routed here instead. Registered under "binance_price", distinct from the
    "binance" broker provider — the registry and ProviderConfig.provider_name are
    both flat/global by name, so reusing "binance" here would silently overwrite
    the broker provider. Binance's price/kline endpoints are public; no credentials
    needed, matching Yahoo's no-auth pattern."""

    @property
    def provider_name(self) -> str:
        return "binance_price"

    def capabilities(self) -> List[Capability]:
        return [Capability.PRICE, Capability.OHLC]

    def get_quote(self, symbol: str) -> NormalizedQuote:
        contract, base_url = _split_futures_symbol(symbol)
        path = "/fapi/v1/ticker/price" if base_url == _FAPI_URL else "/dapi/v1/ticker/price"
        try:
            res = http_client.get("Binance", f"{base_url}{path}", params={"symbol": contract}, timeout=10)
            res.raise_for_status()
            data = res.json()
            row = data[0] if isinstance(data, list) else data
            price = row.get("price")
            if price is None:
                raise ProviderError(f"No price returned by Binance for symbol {contract}")
            return NormalizedQuote(
                symbol=symbol,
                provider=self.provider_name,
                timestamp=datetime.now(timezone.utc),
                price=Decimal(str(price)),
            )
        except ProviderError:
            raise
        except Exception as e:
            raise ProviderError(f"Binance futures get_quote failed for {symbol}: {e}") from e

    def get_technical_indicators(self, symbol: str) -> dict[str, Any]:
        contract, base_url = _split_futures_symbol(symbol)
        path = "/fapi/v1/klines" if base_url == _FAPI_URL else "/dapi/v1/klines"
        try:
            res = http_client.get(
                "Binance", f"{base_url}{path}",
                params={"symbol": contract, "interval": "1d", "limit": 30},
                timeout=10,
            )
            res.raise_for_status()
            klines = res.json()
            closes = pd.Series([float(k[4]) for k in klines])
            if len(closes) < 14:
                raise ValueError("Not enough candles for indicators")

            rsi_val = float(_calculate_rsi(closes).iloc[-1])
            macd_line, signal_line, _ = _calculate_macd(closes)
            macd_val = float(macd_line.iloc[-1])
            macd_sig = float(signal_line.iloc[-1])
            volatility_val = float(closes.pct_change().dropna().std())

            action = "SELL" if rsi_val > 70 else "BUY" if rsi_val < 30 else "HOLD"
            trend = "Overbought" if rsi_val > 70 else "Oversold" if rsi_val < 30 else "Neutral"

            return {
                "rsi": rsi_val, "macd": macd_val, "macd_signal": macd_sig,
                "volatility": volatility_val, "sentiment": None,
                "action": action, "trend": trend,
                "source": "binance", "news_timestamp": None,
            }
        except Exception:
            return {
                "rsi": None, "macd": None, "macd_signal": None,
                "volatility": None, "sentiment": None,
                "action": None, "trend": None,
                "source": "unavailable", "news_timestamp": None,
            }

    def get_news(self, symbol: str) -> List[NormalizedNews]:
        return []

    def health_check(self) -> bool:
        try:
            res = http_client.get("Binance", f"{_FAPI_URL}/fapi/v1/ping", timeout=5)
            return res.status_code == 200
        except Exception:
            return False


registry.register(BinanceFuturesMarketDataProvider)
