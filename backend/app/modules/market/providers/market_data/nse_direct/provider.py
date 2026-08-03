from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, List

from app.core.exceptions import ProviderError
from app.core.providers.capabilities import Capability
from app.core.providers.interfaces import MarketDataProvider
from app.core.providers.registry import registry
from app.core.providers.models import NormalizedNews, NormalizedQuote

_PERIOD_TO_DAYS = {"1mo": 30, "3mo": 90, "6mo": 180, "1y": 365, "2y": 730, "5y": 1825}


def _bare_symbol(symbol: str) -> str:
    """NSE-direct only covers NSE-listed equities — the existing Asset.symbol
    convention suffixes those with '.NS' (see portfolio_importer.py); BSE-only
    listings ('.BO') have no NSE-direct equivalent and must stay on yfinance."""
    if not symbol.endswith(".NS"):
        raise ProviderError(f"nse_direct only covers .NS symbols, got {symbol}")
    return symbol.removesuffix(".NS")


class NseDirectAdapter(MarketDataProvider):
    """Direct NSE bhavcopy/live-quote adapter (via jugaad-data), primary price
    source for India-classified equities — see NSE_DIRECT_INTEGRATION notes.
    Prices are NSE's raw, as-traded (unadjusted for splits/bonuses), unlike
    Yahoo's back-adjusted series — a deliberate choice: back-adjusting would
    require a corporate-actions feed neither jugaad-data nor nsepython expose,
    so a future split shows as a real discontinuity here rather than a smoothed
    one, and pre-cutover history (still yfinance-sourced) is left untouched.
    """

    @property
    def provider_name(self) -> str:
        return "nse_direct"

    def capabilities(self) -> List[Capability]:
        return [Capability.PRICE]

    def get_quote(self, symbol: str) -> NormalizedQuote:
        bare = _bare_symbol(symbol)
        try:
            from jugaad_data.nse import NSELive
            data = NSELive().stock_quote(bare)
        except ProviderError:
            raise
        except Exception as e:
            raise ProviderError(f"nse_direct get_quote failed for {symbol}: {e}") from e

        meta = data.get("metaData", {}) or {}
        trade = data.get("tradeInfo", {}) or {}
        price = meta.get("closePrice") or meta.get("lastPrice")
        if not price:
            raise ProviderError(f"No price returned by nse_direct for symbol {symbol}")
        volume = trade.get("totalTradedVolume")
        return NormalizedQuote(
            symbol=symbol,
            provider=self.provider_name,
            timestamp=datetime.now(timezone.utc),
            price=Decimal(str(price)),
            volume=Decimal(str(volume)) if volume else None,
        )

    def get_news(self, symbol: str) -> List[NormalizedNews]:
        raise ProviderError(f"{self.provider_name} does not support news")

    def get_price_history(self, symbol: str, period: str = "3mo", interval: str = "1d") -> list[dict[str, Any]]:
        if interval != "1d":
            raise ProviderError(f"nse_direct only supports daily price history, got interval={interval}")
        bare = _bare_symbol(symbol)
        days = _PERIOD_TO_DAYS.get(period, 90)
        try:
            from jugaad_data.nse import stock_df
            df = stock_df(
                symbol=bare,
                from_date=date.today() - timedelta(days=days),
                to_date=date.today(),
                series="EQ",
            )
        except ProviderError:
            raise
        except Exception as e:
            raise ProviderError(f"nse_direct get_price_history failed for {symbol}: {e}") from e

        if df.empty:
            return []

        rows = []
        for _, row in df.iterrows():
            close_price = row.get("CLOSE")
            if close_price is None:
                continue
            # jugaad-data's DATE column is mislabeled by exactly one calendar day:
            # it's a UTC timestamp taken at 18:30 (= IST midnight of the *next*
            # trading day) but stored without converting, so the row's real IST
            # trading date is DATE + 1 day. Verified live against Yahoo/NSELive
            # closes for the same session (see NSE_DIRECT_INTEGRATION notes).
            trading_date = row["DATE"] + timedelta(days=1)
            ts = datetime(trading_date.year, trading_date.month, trading_date.day, tzinfo=timezone.utc)
            volume = row.get("VOLUME")
            rows.append({
                "timestamp": ts,
                "close": float(close_price),
                "volume": float(volume) if volume else None,
            })
        return rows

    def health_check(self) -> bool:
        try:
            from jugaad_data.nse import NSELive
            data = NSELive().stock_quote("RELIANCE")
            return bool(data.get("metaData"))
        except Exception:
            return False


registry.register(NseDirectAdapter)
