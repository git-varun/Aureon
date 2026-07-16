from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from app.core.binance import WALLET_SUFFIXES
from app.core.exceptions import NotFoundError
from app.core.services.base import BaseService
from app.modules.market.services.market import MarketService, classify
from app.modules.market.repositories.assets import AssetsRepository

# Crypto-futures symbols (e.g. "ETHUSD_PERP-COINM") are structurally unresolvable
# by the Yahoo-based signal pipeline — Yahoo has no such ticker, so RSI/signal
# will never be computed for them. That's permanent, not "not available yet",
# so it shouldn't surface as a 404 the frontend keeps retrying against.
_UNRESOLVABLE_SIGNAL_SUFFIXES = tuple(f"-{s}" for s in WALLET_SUFFIXES.values())

# NPS-/EPF-/MANUAL- prefixed symbols (portfolio/services/portfolio_importer.py,
# portfolio/api/portfolio.py's create_manual_asset) have no continuous price
# history feed — their LatestQuote, if any, comes from a one-off statement
# import or manual valuation, never from the ingestion pipeline that populates
# AssetSnapshot.rsi. Same permanent-unresolvable case as the suffixes above.
_UNRESOLVABLE_SIGNAL_PREFIXES = ("NPS-", "EPF-", "MANUAL-")


class AssetsService(BaseService):
    def __init__(self, repo: AssetsRepository, market_svc: MarketService):
        self.repo = repo
        self.market_svc = market_svc

    def search(self, search_term: str) -> dict[str, Any]:
        results = self.market_svc.search(search_term)
        return {"data": results, "total": len(results)}

    def get_quote(self, symbol: str) -> dict[str, Any]:
        symbol = symbol.upper().strip()
        quote = self.repo.get_quote(symbol)
        if not quote:
            raise NotFoundError("Asset not found")

        price = float(quote.price)

        return {
            "symbol": symbol,
            "price": price,
            "last_price": price,
            "open": None,
            "previous_close": None,
            "high": None,
            "low": None,
            "high_52w": None,
            "low_52w": None,
            "last_updated": datetime.now(timezone.utc).isoformat(),
        }

    def get_fundamentals(self, symbol: str) -> dict[str, Any]:
        symbol = symbol.upper().strip()
        quote = self.repo.get_quote(symbol)
        if not quote:
            raise NotFoundError("Asset not found")

        snap = self.repo.get_snapshot(quote.asset_id)

        return {
            "symbol": symbol,
            "pe_ratio": float(snap.pe_ratio) if snap and snap.pe_ratio is not None else None,
            "rsi": float(snap.rsi) if snap and snap.rsi is not None else None,
            "market_cap": float(snap.market_cap) if snap and snap.market_cap is not None else None,
            "momentum_score": float(snap.momentum_score) if snap and snap.momentum_score is not None else None,
            "volatility_score": float(snap.volatility_score) if snap and snap.volatility_score is not None else None,
            "sentiment_score": float(snap.sentiment_score) if snap and snap.sentiment_score is not None else None,
        }

    def get_signal(self, symbol: str) -> dict[str, Any]:
        symbol = symbol.upper().strip()

        if symbol.endswith(_UNRESOLVABLE_SIGNAL_SUFFIXES) or symbol.startswith(_UNRESOLVABLE_SIGNAL_PREFIXES):
            return {
                "symbol": symbol,
                "rsi_14": None,
                "signal_type": None,
                "rationale": "Signal unavailable — this asset isn't covered by the price/indicator pipeline.",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }

        quote = self.repo.get_quote(symbol)
        if not quote:
            raise NotFoundError("Signal not found")

        snap = self.repo.get_snapshot(quote.asset_id)
        if not snap or snap.rsi is None:
            raise NotFoundError("Signal not available yet")

        rsi = float(snap.rsi)
        signal_type = "BUY" if rsi < 40 else "SELL" if rsi > 70 else "HOLD"

        return {
            "symbol": symbol,
            "rsi_14": rsi,
            "signal_type": signal_type,
            "rationale": f"RSI is at {rsi:.1f}. Recommending {signal_type}.",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    def get_chart(self, symbol: str, days: int) -> list[dict[str, Any]]:
        symbol = symbol.upper().strip()
        quote = self.repo.get_quote(symbol)
        if not quote:
            raise NotFoundError("Asset not found")

        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        history = self.repo.get_price_history_since(quote.asset_id, cutoff)

        points = []
        for h in history:
            close = float(h.price)
            points.append({
                "date": h.timestamp.strftime("%Y-%m-%d"),
                "close": close,
                "open": round(close * 0.998, 2),
                "high": round(close * 1.003, 2),
                "low": round(close * 0.997, 2),
            })

        return points

    def get_aureon_asset(self, ticker: str, portfolio_id: Optional[UUID]) -> dict[str, Any]:
        ticker = ticker.upper().strip()
        quote = self.repo.get_quote(ticker)
        if not quote:
            raise NotFoundError("Asset not found")

        asset = self.repo.get_asset(ticker)
        name = asset.name if asset else ticker
        asset_class = asset.asset_class if asset else "equity"
        metadata = asset.metadata_payload if asset else {}
        sector = metadata.get("sector") if isinstance(metadata, dict) else "General"

        snap = self.repo.get_snapshot(quote.asset_id)
        price = float(quote.price) if quote.price is not None else None

        pos = self.repo.get_position(portfolio_id, ticker) if portfolio_id else None
        qty = float(pos.quantity) if pos else 0.0
        cost = float(pos.avg_buy_price) if pos else None

        history = self.repo.get_recent_price_history(quote.asset_id, limit=30)
        spark = [float(h.price) for h in reversed(history)] if history else ([price] if price is not None else [])

        return {
            "ticker": ticker,
            "name": name,
            "currentPrice": price,
            "cost": cost,
            "qty": qty,
            "dayPct": None,
            "marketCap": float(snap.market_cap) if snap and snap.market_cap is not None else None,
            "peRatio": float(snap.pe_ratio) if snap and snap.pe_ratio is not None else None,
            "rsi": float(snap.rsi) if snap and snap.rsi is not None else None,
            "sentiment": float(snap.sentiment_score) if snap and snap.sentiment_score is not None else None,
            "class": classify(asset_class, ticker),
            "sector": sector,
            "spark": spark,
        }
