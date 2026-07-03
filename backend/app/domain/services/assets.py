import random
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from app.core.exceptions import NotFoundError
from app.domain.services.base import BaseService
from app.domain.services.market import SEED_INDICES, MarketService, classify
from app.infrastructure.repositories.assets import AssetsRepository


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

        seed_idx = next((i for i in SEED_INDICES if i["sym"] == symbol), None)
        price = float(quote.price) if quote else (seed_idx["value"] if seed_idx else 100.0)
        day_pct = seed_idx["dayPct"] if seed_idx else 0.0

        open_price = round(price / (1 + day_pct), 2) if day_pct != -1 else price
        high = round(price * 1.005, 2)
        low = round(price * 0.995, 2)

        return {
            "symbol": symbol,
            "price": price,
            "last_price": price,
            "open": open_price,
            "previous_close": open_price,
            "high": high,
            "low": low,
            "high_52w": round(price * 1.18, 2),
            "low_52w": round(price * 0.82, 2),
            "last_updated": datetime.now(timezone.utc).isoformat(),
        }

    def get_fundamentals(self, symbol: str) -> dict[str, Any]:
        symbol = symbol.upper().strip()
        quote = self.repo.get_quote(symbol)
        if not quote:
            raise NotFoundError("Asset not found")

        snap = self.repo.get_snapshot(quote.asset_id)
        pe = float(snap.pe_ratio) if snap and snap.pe_ratio is not None else 25.4
        rsi = float(snap.rsi) if snap and snap.rsi is not None else 54.2

        return {
            "symbol": symbol,
            "pe_ratio": pe,
            "rsi": rsi,
            "market_cap": float(snap.market_cap) if snap and snap.market_cap is not None else 15000000000.0,
            "momentum_score": float(snap.momentum_score) if snap and snap.momentum_score is not None else 0.65,
            "volatility_score": float(snap.volatility_score) if snap and snap.volatility_score is not None else 0.22,
            "sentiment_score": float(snap.sentiment_score) if snap and snap.sentiment_score is not None else 0.75,
        }

    def get_signal(self, symbol: str) -> dict[str, Any]:
        symbol = symbol.upper().strip()
        quote = self.repo.get_quote(symbol)

        seed_idx = next((i for i in SEED_INDICES if i["sym"] == symbol), None)
        if not quote and not seed_idx:
            raise NotFoundError("Signal not found")

        snap = self.repo.get_snapshot(quote.asset_id) if quote else None
        rsi = float(snap.rsi) if snap and snap.rsi is not None else 55.0
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

        seed_idx = next((i for i in SEED_INDICES if i["sym"] == symbol), None)
        if not quote and not seed_idx:
            raise NotFoundError("Asset not found")

        points = []
        if quote:
            cutoff = datetime.now(timezone.utc) - timedelta(days=days)
            history = self.repo.get_price_history_since(quote.asset_id, cutoff)
            for h in history:
                close = float(h.price)
                points.append({
                    "date": h.timestamp.strftime("%Y-%m-%d"),
                    "close": close,
                    "open": round(close * 0.998, 2),
                    "high": round(close * 1.003, 2),
                    "low": round(close * 0.997, 2),
                })

        if not points:
            seed_price = float(quote.price) if quote and quote.price else (seed_idx["value"] if seed_idx else 100.0)
            random.seed(symbol)
            current = seed_price
            for i in range(days):
                dt = datetime.now(timezone.utc) - timedelta(days=days - i)
                current *= (1.0 + random.uniform(-0.015, 0.015))
                close = round(current, 2)
                points.append({
                    "date": dt.strftime("%Y-%m-%d"),
                    "close": close,
                    "open": round(close * 0.998, 2),
                    "high": round(close * 1.004, 2),
                    "low": round(close * 0.996, 2),
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
        price = float(quote.price) if quote.price is not None else 100.0

        pos = self.repo.get_position(portfolio_id, ticker) if portfolio_id else None
        qty = float(pos.quantity) if pos else 0.0
        cost = float(pos.avg_buy_price) if pos else None

        history = self.repo.get_recent_price_history(quote.asset_id, limit=30)
        spark = [float(h.price) for h in reversed(history)] if history else [price]

        return {
            "ticker": ticker,
            "name": name,
            "currentPrice": price,
            "cost": cost,
            "qty": qty,
            "dayPct": 0.0064,
            "marketCap": float(snap.market_cap) if snap and snap.market_cap is not None else 1940000000000.0,
            "peRatio": float(snap.pe_ratio) if snap and snap.pe_ratio is not None else 28.5,
            "rsi": float(snap.rsi) if snap and snap.rsi is not None else 58.2,
            "sentiment": float(snap.sentiment_score) if snap and snap.sentiment_score is not None else 0.65,
            "class": classify(asset_class, ticker),
            "sector": sector,
            "spark": spark,
        }
