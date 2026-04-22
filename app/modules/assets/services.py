"""Assets service layer — centralises all asset and price business logic.

Data flow: Route / Task / Cron → AssetsService → Repositories / PriceProviderService
"""

import logging
from datetime import datetime, timezone
from typing import List, Optional

import pandas as pd
from sqlalchemy.orm import Session

from app.core.cache import cache
from app.modules.assets.repositories import AssetRepository, PriceHistoryRepository
from app.modules.portfolio.models import Asset, Position, PriceHistory
from app.shared.constants import AssetType
from app.shared.interfaces import PriceProvider
from app.shared.utils import cache_key, normalize_yf_symbol

logger = logging.getLogger("assets.service")


# ---------------------------------------------------------------------------
# PriceProviderService — pure price fetching, no DB writes
# ---------------------------------------------------------------------------

class PriceProviderService:
    """Fetch live prices via a chain of PriceProvider implementations.

    DB persistence is intentionally excluded here; the AssetsService owns that
    responsibility so all callers go through a single write path.
    """

    def __init__(self, price_providers: List[PriceProvider]):
        self.price_providers = price_providers
        logger.debug(
            "PriceProviderService initialised with %d providers: %s",
            len(price_providers),
            [getattr(p, "provider_name", type(p).__name__) for p in price_providers],
        )

    def fetch(self, symbol: str, asset_type: str) -> float:
        """Return the first successful price or 0.0 if all providers fail."""
        for provider in self.price_providers:
            name = getattr(provider, "provider_name", type(provider).__name__)
            try:
                payload = provider.get_price(symbol, asset_type)
                if payload is not None:
                    price = float(getattr(payload, "price", payload))
                    logger.info("fetch: %s → %.4f via %s", symbol, price, name)
                    return price
            except Exception as exc:
                logger.debug("fetch: %s provider=%s failed: %s", symbol, name, exc)

        logger.warning("fetch: %s — all providers exhausted, returning 0.0", symbol)
        return 0.0

    def fetch_batch(self, symbols: List[str], asset_type: str = "equity") -> dict:
        """Fetch prices for multiple symbols; skips symbols that return 0."""
        results: dict = {}
        for symbol in symbols:
            price = self.fetch(symbol, asset_type)
            if price > 0:
                results[symbol] = price
        if len(results) < len(symbols):
            missing = sorted(set(symbols) - set(results))
            logger.warning("fetch_batch: no price for: %s", missing)
        return results


# ---------------------------------------------------------------------------
# AssetsService — asset CRUD + price management + chart data
# ---------------------------------------------------------------------------

class AssetsService:
    """Central service for all asset-level operations.

    Instantiated with a SQLAlchemy session so it can be used from routes
    (with DI) or from Celery tasks (with an explicit SessionLocal()).
    """

    def __init__(self, session: Session):
        self.session = session
        self.asset_repo = AssetRepository(session)
        self.price_repo = PriceHistoryRepository(session)
        logger.debug("AssetsService initialised session_id=%s", id(session))

    # ── Asset queries ────────────────────────────────────────────────────

    def list_assets(
        self,
        asset_type: Optional[AssetType] = None,
        exchange: Optional[str] = None,
        search: Optional[str] = None,
    ) -> List[Asset]:
        assets = self.asset_repo.list_all(asset_type=asset_type, exchange=exchange, search=search)
        logger.info(
            "list_assets: returned %d (type=%s exchange=%s search=%s)",
            len(assets), asset_type, exchange, search,
        )
        return assets

    def get_asset(self, symbol: str) -> Optional[Asset]:
        return self.asset_repo.get_by_symbol(symbol)

    def get_asset_detail(self, symbol: str) -> Optional[dict]:
        """Return extended asset dict including recent price samples."""
        asset = self.get_asset(symbol)
        if not asset:
            return None

        recent = self.price_repo.get_last_n_days(asset.id, days=1)
        prices_24h = [float(p.close) for p in recent]
        volume_24h = sum(float(p.volume or 0) for p in recent) or None
        latest_ts = recent[-1].date if recent else None

        return {
            "id": asset.id,
            "symbol": asset.symbol,
            "name": asset.name,
            "type": asset.asset_type.value if asset.asset_type else None,
            "exchange": asset.exchange,
            "current_price": asset.current_price,
            "previous_close": asset.previous_close,
            "market_cap": asset.market_cap,
            "updated_at": asset.updated_at,
            "prices_24h": prices_24h,
            "volume_24h": volume_24h,
            "latest_price_ts": latest_ts,
        }

    # ── Price history ────────────────────────────────────────────────────

    def get_price_history(self, symbol: str, days: int = 30) -> List[PriceHistory]:
        asset = self.get_asset(symbol)
        if not asset:
            return []
        return self.price_repo.get_last_n_days(asset.id, days=days)

    # ── Chart data ───────────────────────────────────────────────────────

    def get_chart_data(self, symbol: str, days: int = 365) -> List[dict]:
        """Return OHLCV candles with SMA/EMA/Bollinger overlays for TradingView."""
        prices = self.get_price_history(symbol, days=days)
        if not prices:
            return []

        closes = pd.Series([float(p.close) for p in prices])
        sma50  = closes.rolling(50).mean()
        sma200 = closes.rolling(200).mean()
        ema20  = closes.ewm(span=20, adjust=False).mean()
        rm20   = closes.rolling(20).mean()
        rs20   = closes.rolling(20).std()
        bbu    = rm20 + 2 * rs20
        bbl    = rm20 - 2 * rs20

        def is_valid_float(val) -> bool:
            """Check if value is a valid JSON-serializable number."""
            if pd.notna(val).empty:
                return False
            if isinstance(val, (float, int)):
                return not (pd.isna(val) or pd.isnull(val) or pd.isna(float(val)))
            return False

        result = []
        for i, p in enumerate(prices):
            # Skip incomplete candles (market closure: weekends, holidays, data gaps)
            # lightweight-charts requires valid OHLC numbers, not null
            if p.open_price is None or p.high is None or p.low is None or p.close is None:
                logger.debug("get_chart_data: skipping incomplete candle for %s on %s", symbol, p.date)
                continue

            candle: dict = {
                "time":   int(p.date.timestamp()),
                "open": float(p.open_price),
                "high": float(p.high),
                "low": float(p.low),
                "close":  float(p.close),
                "volume": int(p.volume or 0),
            }
            # Add technical indicators only if valid (not NaN, not inf)
            if is_valid_float(sma50.iloc[i]):  candle["sma50"] = round(float(sma50.iloc[i]), 2)
            if is_valid_float(sma200.iloc[i]): candle["sma200"] = round(float(sma200.iloc[i]), 2)
            if is_valid_float(ema20.iloc[i]):  candle["ema20"] = round(float(ema20.iloc[i]), 2)
            if is_valid_float(bbu.iloc[i]):    candle["bbu"] = round(float(bbu.iloc[i]), 2)
            if is_valid_float(bbl.iloc[i]):    candle["bbl"] = round(float(bbl.iloc[i]), 2)
            result.append(candle)

        logger.info("get_chart_data: %s — returned %d candles (filtered from %d prices)", symbol, len(result),
                    len(prices))
        return result

    # ── Price updates ────────────────────────────────────────────────────

    def update_asset_price(self, asset: Asset, price: float) -> None:
        """Persist live price to the asset row and cascade to all positions."""
        asset.current_price = price
        self.session.commit()

        # Save snapshot in price_history
        self.price_repo.save_snapshot(
            asset_id=asset.id,
            date=datetime.now(timezone.utc),
            close=price,
            open_price=price,
            high=price,
            low=price,
            volume=0,
        )

        # Cascade price to positions (update P&L)
        for pos in asset.positions:
            self._update_position_pnl(pos, price)

        logger.info("update_asset_price: %s → %.4f", asset.symbol, price)

    def _update_position_pnl(self, pos: Position, new_price: float) -> None:
        pos.current_value = pos.quantity * new_price
        pos.pnl = pos.current_value - (pos.quantity * pos.avg_buy_price)
        pos.pnl_percent = (
            (pos.pnl / (pos.quantity * pos.avg_buy_price) * 100)
            if pos.avg_buy_price > 0
            else 0.0
        )
        self.session.commit()

    def refresh_prices(self, symbol: Optional[str] = None) -> dict:
        """Fetch live prices for one or all assets and persist them.

        This is the canonical price-refresh path; Celery tasks delegate here.
        """
        from app.modules.assets.providers.factory import get_price_providers

        providers = get_price_providers(self.session)
        price_svc = PriceProviderService(providers)

        assets = (
            [self.get_asset(symbol)]
            if symbol
            else self.asset_repo.list_all()
        )
        updated = 0
        skipped = 0

        for asset in assets:
            if not asset:
                continue
            yf_sym = normalize_yf_symbol(
                asset.symbol,
                asset.asset_type.value if asset.asset_type else "equity",
                asset.exchange or "NSE",
            )
            price = price_svc.fetch(yf_sym, asset.asset_type.value if asset.asset_type else "equity")

            if price > 0:
                self.update_asset_price(asset, price)
                updated += 1
            else:
                logger.warning("refresh_prices: no price for %s (%s)", asset.symbol, yf_sym)
                skipped += 1

        cache.set(cache_key("prices", "refreshed_at"), datetime.now(timezone.utc).isoformat(), ttl=3600)
        cache.clear_pattern("portfolio:*")
        logger.info("refresh_prices: updated=%d skipped=%d", updated, skipped)
        return {"status": "success", "assets_updated": updated, "assets_skipped": skipped}
