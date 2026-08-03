from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from app.core.binance import WALLET_SUFFIXES
from app.core.exceptions import NotFoundError, ProviderError
from app.core.redis import get_cached_quote
from app.core.services.base import BaseService
from app.modules.market.services.market import MarketService, classify, infer_currency
from app.modules.market.repositories.assets import AssetsRepository
from app.modules.market.repositories.asset_fundamentals import AssetFundamentalsRepository

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


def _signal_confidence(rsi: float, signal_type: str) -> int:
    """How far RSI sits past the threshold that triggered signal_type, scaled
    0-100 — a real, deterministic function of the same RSI value the signal
    itself is based on (not a placeholder/fabricated number)."""
    if signal_type == "BUY":
        pct = (40.0 - rsi) / 40.0 * 100.0
    elif signal_type == "SELL":
        pct = (rsi - 70.0) / 30.0 * 100.0
    else:  # HOLD — confidence in "no strong signal" peaks at the RSI midpoint
        pct = 100.0 - abs(rsi - 55.0) / 15.0 * 100.0
    return round(max(0.0, min(100.0, pct)))


class AssetsService(BaseService):
    def __init__(self, repo: AssetsRepository, market_svc: MarketService, fundamentals_repo: AssetFundamentalsRepository):
        self.repo = repo
        self.market_svc = market_svc
        self.fundamentals_repo = fundamentals_repo

    def search(self, search_term: str) -> dict[str, Any]:
        results = self.market_svc.search(search_term)
        return {"data": results, "total": len(results)}

    def get_quote(self, symbol: str) -> dict[str, Any]:
        symbol = symbol.upper().strip()

        cached = get_cached_quote(symbol)
        quote = self.repo.get_quote(symbol)
        if cached:
            price = float(cached["price"])
        else:
            if not quote:
                raise NotFoundError("Asset not found")
            price = float(quote.price)

        return {
            "symbol": symbol,
            "asset_id": str(quote.asset_id) if quote and quote.asset_id else None,
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

    def _refresh_fundamentals(self, symbol: str, asset_id: UUID) -> None:
        """Synchronous, single-symbol version of refresh_fundamentals_task
        (app/workers/ingestion/tasks.py) for the Fundamentals tab's Refresh
        button. Swallows ProviderError (e.g. yfinance has no coverage for this
        symbol, or it's a mutual fund/crypto asset yfinance can't resolve) so a
        refresh attempt on an unsupported symbol doesn't 500 the whole page —
        the response just keeps serving whatever real data already exists."""
        from app.core.providers.factory import ProviderFactory
        from app.core.repositories.config import ConfigRepository
        from app.core.services.config import ConfigService

        try:
            adapter = ProviderFactory(ConfigService(ConfigRepository(self.repo.session))).get("yahoo")
            fundamentals = adapter.get_fundamentals(symbol)
            self.fundamentals_repo.upsert(asset_id, fundamentals)
            self.repo.session.commit()
        except ProviderError:
            self.repo.session.rollback()

    def get_fundamentals(self, symbol: str, refresh: bool = False) -> dict[str, Any]:
        symbol = symbol.upper().strip()
        quote = self.repo.get_quote(symbol)
        if not quote:
            raise NotFoundError("Asset not found")

        if refresh and quote.asset_id:
            self._refresh_fundamentals(symbol, quote.asset_id)

        snap = self.repo.get_snapshot(quote.asset_id)
        score = self.repo.get_latest_score(quote.asset_id)
        fund = self.fundamentals_repo.get(quote.asset_id) if quote.asset_id else None

        # pe_ratio prefers the real asset_fundamentals.trailing_pe (yfinance-sourced,
        # refreshed by refresh_fundamentals_task / this method's refresh=true path)
        # over the older AssetSnapshot.pe_ratio, which is frequently null.
        pe_ratio = (
            float(fund.trailing_pe) if fund and fund.trailing_pe is not None
            else float(snap.pe_ratio) if snap and snap.pe_ratio is not None
            else None
        )

        # data_source reflects where this response's data actually came from —
        # must never claim "live" when nothing real backs it (see FundamentalsTab.jsx
        # footer text, which reads this field directly).
        if fund is not None:
            data_source = "live"
        elif snap is not None or score is not None:
            data_source = "partial"
        else:
            data_source = None

        return {
            "symbol": symbol,
            "pe_ratio": pe_ratio,
            "rsi": float(snap.rsi) if snap and snap.rsi is not None else None,
            "market_cap": float(snap.market_cap) if snap and snap.market_cap is not None else None,
            "momentum_score": float(snap.momentum_score) if snap and snap.momentum_score is not None else None,
            "volatility_score": float(snap.volatility_score) if snap and snap.volatility_score is not None else None,
            "sentiment_score": float(snap.sentiment_score) if snap and snap.sentiment_score is not None else None,
            "quality_score": float(score.quality_score) if score and score.quality_score is not None else None,
            "valuation_score": float(score.valuation_score) if score and score.valuation_score is not None else None,
            # Real, sourced from market.asset_fundamentals (yfinance, via
            # refresh_fundamentals_task / this method's refresh=true path).
            #
            # Unit note: yfinance's ticker.info returns roe as a true fraction
            # (e.g. 0.477 = 47.7%) but debtToEquity and dividendYield already as
            # percentage-point numbers (e.g. 10.211 means D/E of 0.10211, 2.66
            # means a 2.66% yield) — confirmed directly against yfinance for
            # TCS.NS during this fix (roe=0.47743, debtToEquity=10.211,
            # dividendYield=2.66, real-world D/E for TCS is near-debt-free ~0.1,
            # real-world yield ~1.5-3%). de_ratio/dividend_yield are normalized
            # to true fractions/ratios here so both frontend consumers — which
            # already assume "roe and dividend_yield are fractions you format as
            # %, pb_ratio and de_ratio are plain ratio numbers" — render correctly
            # without needing their own unit-conversion logic.
            "pb_ratio": float(fund.price_to_book) if fund and fund.price_to_book is not None else None,
            "roe": float(fund.roe) if fund and fund.roe is not None else None,
            "de_ratio": float(fund.debt_to_equity) / 100 if fund and fund.debt_to_equity is not None else None,
            "dividend_yield": float(fund.dividend_yield) / 100 if fund and fund.dividend_yield is not None else None,
            # BACKLOG — no backing source anywhere in Aureon today for these; the
            # frontend (FundamentalsTab.jsx) renders each as "Unavailable" rather
            # than a fake value:
            #   eps: needs earnings-per-share data. Not currently ingested from any
            #     provider — the yahoo adapter's get_fundamentals() (yahoo/provider.py)
            #     doesn't request it from ticker.info; would need `trailingEps` added
            #     there plus a new `eps` column on market.asset_fundamentals.
            #   beta: partially exists already — the yahoo adapter's get_fundamentals()
            #     (yahoo/provider.py) already fetches `info.get("beta")` from yfinance,
            #     but AssetFundamentals (entities/market.py) has no `beta` column and
            #     AssetFundamentalsRepository.upsert() (repositories/asset_fundamentals.py)
            #     silently drops it. Smaller lift than the others: add the column via
            #     migration, thread it through upsert(), map it here. `market_cap`
            #     above is in the same situation (already fetched as info.get("marketCap"),
            #     already dropped by upsert()) — it's not in this pass's null list
            #     because AssetSnapshot.market_cap is a separate, older field this
            #     method already reads, but that field is frequently null (e.g. it
            #     is for TCS.NS as of this writing) where asset_fundamentals.market_cap
            #     would be real and fresh if the column existed.
            #   vol_30d: computable from market.price_history (30-day realized/annualized
            #     volatility) — AssetSnapshot.volatility_score is a related but different
            #     normalized 0-1 score, not the literal annualized 30-day % this field
            #     implies. Would need a new calculation, not just a remap.
            #   high_52w / low_52w: computable as max/min over market.price_history once
            #     retention covers 52 weeks — it doesn't yet (e.g. TCS.NS's earliest
            #     price_history row is 2026-04-06, ~4 months of history as of this
            #     writing), so a computed 52W range today would be real-looking but
            #     quietly wrong (too narrow), not honestly "unavailable". Revisit once
            #     price_history has a full year of retention.
            #   graham_number: standard formula needs both eps and book-value-per-share;
            #     blocked on eps above (book value per share is derivable from price /
            #     pb_ratio once pb_ratio is real, which it now is).
            "eps": None,
            "beta": None,
            "vol_30d": None,
            "high_52w": None,
            "low_52w": None,
            "graham_number": None,
            "data_source": data_source,
        }

    def get_signal(self, symbol: str) -> dict[str, Any]:
        symbol = symbol.upper().strip()

        if symbol.endswith(_UNRESOLVABLE_SIGNAL_SUFFIXES) or symbol.startswith(_UNRESOLVABLE_SIGNAL_PREFIXES):
            return {
                "symbol": symbol,
                "rsi_14": None,
                "signal_type": None,
                "confidence": None,
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
            "confidence": _signal_confidence(rsi, signal_type),
            "rationale": f"RSI is at {rsi:.1f}. Recommending {signal_type}.",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    def get_batch(self, symbols: list[str]) -> dict[str, dict[str, Any]]:
        """Batched asset-detail + signal lookup for N symbols in one round
        trip. Replaces the frontend's useAureonData.js pattern of firing one
        /assets search call and one /signals/{symbol} call per position
        (2N requests for an N-holding portfolio)."""
        symbols = sorted({s.upper().strip() for s in symbols if s and s.strip()})
        if not symbols:
            return {}

        assets_by_symbol = self.repo.get_assets_by_symbols(symbols)
        quotes_by_symbol = self.repo.get_quotes_by_symbols(symbols)
        asset_ids = [a.id for a in assets_by_symbol.values()]
        snapshots_by_asset_id = self.repo.get_snapshots_by_asset_ids(asset_ids)

        results: dict[str, dict[str, Any]] = {}
        for symbol in symbols:
            asset_row = assets_by_symbol.get(symbol)
            quote = quotes_by_symbol.get(symbol)
            price = float(quote.price) if quote and quote.price is not None and quote.price != 0 else None

            asset_out = None
            if asset_row is not None:
                asset_out = {
                    "sym": asset_row.symbol,
                    "name": asset_row.name,
                    "price": price,
                    # Still one query per symbol (PriceHistory has no bulk-diff
                    # query yet) — the N+1 this endpoint targets is the two
                    # full HTTP round trips per symbol, not every DB query.
                    "dayPct": self.market_svc._compute_day_pct(quote.asset_id) if quote else None,
                    "class": classify(asset_row.asset_class, asset_row.symbol),
                    "sector": (asset_row.metadata_payload or {}).get("sector", "General"),
                }

            signal_out = None
            if symbol.endswith(_UNRESOLVABLE_SIGNAL_SUFFIXES) or symbol.startswith(_UNRESOLVABLE_SIGNAL_PREFIXES):
                signal_out = None  # matches get_signal's null-fields case; frontend already skips signal_type==null
            else:
                snap = snapshots_by_asset_id.get(asset_row.id) if asset_row else None
                if snap is not None and snap.rsi is not None:
                    rsi = float(snap.rsi)
                    signal_type = "BUY" if rsi < 40 else "SELL" if rsi > 70 else "HOLD"
                    signal_out = {
                        "symbol": symbol,
                        "rsi_14": rsi,
                        "signal_type": signal_type,
                        "confidence": _signal_confidence(rsi, signal_type),
                        "rationale": f"RSI is at {rsi:.1f}. Recommending {signal_type}.",
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    }

            results[symbol] = {"asset": asset_out, "signal": signal_out}

        return results

    def get_chart(self, symbol: str, days: int) -> list[dict[str, Any]]:
        symbol = symbol.upper().strip()
        quote = self.repo.get_quote(symbol)
        if not quote:
            raise NotFoundError("Asset not found")

        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        history = self.repo.get_price_history_since(quote.asset_id, cutoff)

        # BACKLOG: market.price_history has no open/high/low columns — only one
        # `price` sample per timestamp. This method used to fabricate open/high/low
        # by multiplying close by fixed ratios (0.998/1.003/0.997), which rendered
        # as real-looking candlestick wicks on the Terminal chart even though no
        # real intraday range was ever observed. A real intraday OHLC pipeline
        # (provider bars with actual open/high/low, or aggregating ingested
        # intraday quotes into per-period bars) would be needed to support candles
        # honestly. Until that exists, only real `close`/`volume` are exposed here
        # and the frontend renders a line/area series, not candlesticks.
        #
        # `time` is a unix-second timestamp (lightweight-charts requires strictly
        # ascending, unique `time` values) — deduped defensively in case two rows
        # ever land in the same second, keeping the latest sample for that second.
        # A small number of existing price_history rows have a NaN `price` (bad
        # upstream yfinance data captured before this method existed, pre-dating
        # this fix — not something new code produces). NaN isn't valid JSON, so a
        # row like that isn't "close to zero", it's genuinely missing — skip it
        # rather than let it 500 the whole chart or coerce it into a fake number.
        points: dict[int, dict[str, Any]] = {}
        for h in history:
            close = float(h.price)
            if close != close:  # NaN check without importing math
                continue
            ts = int(h.timestamp.replace(tzinfo=timezone.utc).timestamp())
            volume = float(h.volume) if h.volume is not None else None
            if volume is not None and volume != volume:
                volume = None
            points[ts] = {
                "time": ts,
                "close": close,
                "volume": volume,
            }

        return [points[ts] for ts in sorted(points)]

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
            "currency": infer_currency(asset_class, ticker, metadata),
        }
