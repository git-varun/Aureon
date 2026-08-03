import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.core.redis import get_cached_asset_features, get_cached_asset_snapshot
from app.modules.market.entities.market import AssetSnapshot, LatestQuote, MarketTheme, ThemeWeight
from app.core.entities.system import User
from app.core.services.base import BaseService
from app.modules.market.repositories.asset_features import AssetFeaturesRepository
from app.modules.market.repositories.asset_snapshot import AssetSnapshotRepository
from app.modules.market.repositories.market import MarketRepository

# Ticker -> (display name, region) for indices seeded via app.workers.ingestion.tasks._INDEX_ASSETS.
INDEX_META: list[tuple[str, str, str]] = [
    ("^NSEI",    "NIFTY 50",   "IN"),
    ("^BSESN",   "SENSEX",     "IN"),
    ("^NSEBANK", "BANK NIFTY", "IN"),
    ("^CNXIT",   "NIFTY IT",   "IN"),
    ("^GSPC",    "S&P 500",    "US"),
    ("^IXIC",    "NASDAQ",     "US"),
    ("^FTSE",    "FTSE 100",   "EU"),
    ("^N225",    "NIKKEI 225", "AS"),
]

# Static symbol -> sector map for the tracked universe (v1: no auto-classification for
# symbols added later; Asset.classification exists but is never populated by seeding).
SYMBOL_SECTOR_MAP: dict[str, str] = {
    "TCS.NS": "IT", "INFY.NS": "IT", "WIPRO.NS": "IT", "HCLTECH.NS": "IT",
    "AAPL": "IT", "MSFT": "IT", "NVDA": "IT", "GOOGL": "IT", "META": "IT", "AMZN": "IT",
    "HDFCBANK.NS": "Financials", "ICICIBANK.NS": "Financials", "SBIN.NS": "Financials",
    "RELIANCE.NS": "Energy", "ADANIGREEN.NS": "Energy", "TATAPOWER.NS": "Energy", "SUZLON.NS": "Energy",
    "HINDUNILVR.NS": "FMCG", "ITC.NS": "FMCG", "DABUR.NS": "FMCG", "MARICO.NS": "FMCG", "ASIANPAINT.NS": "FMCG",
    "TSLA": "Auto",
    "LT.NS": "Capital goods", "BHEL.NS": "Capital goods", "SIEMENS.NS": "Capital goods", "ABB.NS": "Capital goods",
    "BHARTIARTL.NS": "Telecom",
}

SYSTEM_THEMES = {
    "rate-cut": {
        "id": "rate-cut",
        "name": "Rate-cut beneficiaries",
        "desc": "Short-duration treasuries + rate-sensitive financials",
        "symbols": ["SGOV", "HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS"],
        "weights": {"SGOV": 0.25, "HDFCBANK.NS": 0.25, "ICICIBANK.NS": 0.25, "SBIN.NS": 0.25},
        "inception_date": "2024-01-01",
        "count": 4
    },
    "capex": {
        "id": "capex",
        "name": "India capex cycle",
        "desc": "Infra, capital goods, cement plays",
        "symbols": ["LT.NS", "BHEL.NS", "SIEMENS.NS", "ABB.NS"],
        "weights": {"LT.NS": 0.25, "BHEL.NS": 0.25, "SIEMENS.NS": 0.25, "ABB.NS": 0.25},
        "inception_date": "2024-01-01",
        "count": 4
    },
    "ai-india": {
        "id": "ai-india",
        "name": "AI services exposure",
        "desc": "Indian IT vendors with AI revenue mix",
        "symbols": ["TCS.NS", "INFY.NS", "WIPRO.NS", "HCLTECH.NS"],
        "weights": {"TCS.NS": 0.25, "INFY.NS": 0.25, "WIPRO.NS": 0.25, "HCLTECH.NS": 0.25},
        "inception_date": "2024-01-01",
        "count": 4
    },
    "green-energy": {
        "id": "green-energy",
        "name": "Green energy transition",
        "desc": "Solar, EV ecosystem, transmission",
        "symbols": ["ADANIGREEN.NS", "TATAPOWER.NS", "SUZLON.NS"],
        "weights": {"ADANIGREEN.NS": 0.3333, "TATAPOWER.NS": 0.3333, "SUZLON.NS": 0.3334},
        "inception_date": "2024-01-01",
        "count": 3
    },
    "el-nino": {
        "id": "el-nino",
        "name": "Monsoon-resilient FMCG",
        "desc": "Stable demand through weather variance",
        "symbols": ["HINDUNILVR.NS", "ITC.NS", "DABUR.NS", "MARICO.NS"],
        "weights": {"HINDUNILVR.NS": 0.25, "ITC.NS": 0.25, "DABUR.NS": 0.25, "MARICO.NS": 0.25},
        "inception_date": "2024-01-01",
        "count": 4
    },
    "small-cap": {
        "id": "small-cap",
        "name": "Small-cap quality",
        "desc": "ROE > 18%, debt-to-equity < 0.5",
        "symbols": [],
        "weights": {},
        "inception_date": "2024-01-01",
        "count": 0
    }
}


def ensure_asset_exists(session: Session, symbol: str, name: Optional[str] = None, asset_class: str = "equity", tier: Optional[int] = None) -> uuid.UUID:
    symbol = symbol.upper().strip()
    asset_id = uuid.uuid5(uuid.NAMESPACE_DNS, symbol)

    # Only touch the Asset row when a name is supplied — existing callers that don't
    # pass one keep relying on Asset rows created elsewhere (e.g. universe seeding).
    if name:
        from app.modules.market.entities.market import Asset
        asset = session.scalar(select(Asset).filter_by(symbol=symbol))
        if not asset:
            session.add(Asset(id=asset_id, symbol=symbol, name=name, asset_class=asset_class, tier=tier))
            session.flush()
        else:
            if not asset.name or asset.name == symbol:
                asset.name = name
            if tier is not None and asset.tier != tier:
                asset.tier = tier
            session.flush()

    # LatestQuote is intentionally NOT seeded here: it must only ever hold a real
    # ingested (or manually-entered, see update_manual_valuation) price. A row
    # existing is the signal downstream consumers use to mean "a real quote/value
    # was recorded" — seeding a fake 0.0 here would defeat that.
    quote = session.scalar(select(LatestQuote).filter_by(symbol=symbol))

    snapshot = session.scalar(select(AssetSnapshot).filter_by(asset_id=asset_id))
    if not snapshot:
        snapshot = AssetSnapshot(
            asset_id=asset_id,
            price=quote.price if quote else None,
            market_cap=None,
            pe_ratio=None,
            rsi=None,
            momentum_score=None,
            volatility_score=None,
            sentiment_score=None,
            payload={},
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        session.add(snapshot)
        session.flush()

    return asset_id


def infer_exchange_region(symbol: str) -> tuple[str, str]:
    if symbol.endswith(".NS"):
        return "NSE", "IN"
    if symbol.endswith(".BO"):
        return "BSE", "IN"
    if symbol.endswith("-USD") or symbol.endswith("-USDM") or symbol.endswith("-COINM"):
        return "CRYPTO", "GLOBAL"
    if symbol.startswith("^"):
        return "INDEX", "GLOBAL"
    return "NASDAQ", "US"


# Exchange suffix -> currency for the single-currency exchanges added in
# Phase D (Japan/HK/Europe) — live-confirmed real currency per market
# (7203.T=JPY, 0700.HK=HKD, ASML.AS/SAP.DE/MC.PA=EUR, etc.). London (.L) is
# deliberately excluded: live-tested to NOT be a reliable single currency
# (ordinary equities quote in GBp/pence, some ETFs in GBP, others in USD —
# see Phase D investigation) — so .L has no suffix-based entry here and
# always needs the real per-symbol resolution below.
_SUFFIX_CURRENCY: dict[str, str] = {
    ".T": "JPY", ".HK": "HKD",
    ".DE": "EUR", ".PA": "EUR", ".AS": "EUR", ".MI": "EUR", ".MC": "EUR",
    ".BR": "EUR", ".LS": "EUR", ".VI": "EUR", ".HE": "EUR",
    ".ST": "SEK", ".CO": "DKK", ".OL": "NOK", ".SW": "CHF",
}


def infer_currency(asset_class: Optional[str], symbol: str, metadata: Optional[dict[str, Any]] = None) -> str:
    """EPF/NPS/mutual_fund symbols (EPF-<uan>, NPS-<pran>-<letter>-T<tier>,
    <isin>_MF) carry no currency-bearing suffix the way equities (.NS/.BO) or
    crypto (-USD) do, so asset_class must be checked before falling back to
    infer_exchange_region's suffix rules.

    `metadata` is the asset's Asset.metadata_payload, when the caller has it
    loaded — a real provider-resolved currency there (persisted by
    IngestionRepository.update_asset_currency on quote ingestion) always wins
    over the suffix heuristic below, since a suffix alone cannot reliably
    determine currency for exchanges like LSE (.L) that mix GBp/GBP/USD
    per-symbol (see Phase D investigation). The heuristic is only a fallback
    for assets that haven't had a quote ingested yet."""
    if metadata and metadata.get("currency"):
        return metadata["currency"]
    if asset_class in ("epf", "nps", "mutual_fund"):
        return "INR"
    if symbol.endswith(".NS") or symbol.endswith(".BO"):
        return "INR"
    for suffix, currency in _SUFFIX_CURRENCY.items():
        if symbol.endswith(suffix):
            return currency
    if symbol.endswith(".L"):
        # Best-effort pre-metadata default (majority case, live-confirmed) —
        # corrected to the real resolved currency (GBP/USD/...) as soon as
        # this symbol's first quote is ingested. Never guessed once metadata
        # is present (see the metadata check above).
        return "GBP"
    return "USD"


def classify(asset_class: Optional[str], symbol: str = "") -> str:
    if not asset_class:
        return "stocks"
    ac = asset_class.lower()
    if "stablecoin" in ac:
        return "stablecoin"
    if "crypto" in ac:
        return "crypto"
    if "bond" in ac:
        return "bonds"
    if "mutual_fund" in ac or "fund" in ac:
        return "funds"
    if "real_estate" in ac or "property" in ac:
        return "real_estate"
    if "retirement" in ac or "epf" in ac or "nps" in ac:
        return "retirement"
    if "insurance" in ac:
        return "insurance"
    if symbol.endswith("_MF"):
        return "funds"
    if symbol.endswith("-USD"):
        return "crypto"
    return "stocks"


class MarketService(BaseService):
    def __init__(self, repo: MarketRepository):
        self.repo = repo
        self.snapshot_repo = AssetSnapshotRepository(repo.session)
        self.features_repo = AssetFeaturesRepository(repo.session)

    def _compute_day_pct(self, asset_id: Optional[uuid.UUID]) -> Optional[float]:
        """Latest PriceHistory sample vs. the nearest sample >=24h prior. Approximates
        day-over-day change without a dedicated prior-close field (none exists in the schema).
        Returns None when no real change can be computed — callers must not treat that as 0%."""
        if not asset_id:
            return None
        latest = self.repo.get_latest_price_history(asset_id)
        if not latest:
            return None
        cutoff = latest.timestamp - timedelta(hours=24)
        prior = self.repo.get_price_history_before(asset_id, cutoff)
        if not prior:
            prior = self.repo.get_earliest_price_history(asset_id)
        if not prior or float(prior.price) == 0 or prior.id == latest.id:
            return None
        return round((float(latest.price) - float(prior.price)) / float(prior.price), 4)

    def get_asset_snapshot(self, asset_id: uuid.UUID) -> dict[str, Any]:
        cached = get_cached_asset_snapshot(str(asset_id))
        if cached:
            return cached

        snapshot = self.snapshot_repo.get(asset_id)
        if not snapshot:
            raise NotFoundError("Asset snapshot not found")

        return {
            "asset_id": str(snapshot.asset_id),
            "price": snapshot.price,
            "market_cap": snapshot.market_cap,
            "pe_ratio": snapshot.pe_ratio,
            "rsi": snapshot.rsi,
            "momentum_score": snapshot.momentum_score,
            "volatility_score": snapshot.volatility_score,
            "sentiment_score": snapshot.sentiment_score,
            "payload": snapshot.payload,
            "updated_at": snapshot.updated_at
        }

    def get_asset_features(self, asset_id: uuid.UUID) -> dict[str, Any]:
        cached = get_cached_asset_features(str(asset_id))
        if cached:
            return cached

        features = self.features_repo.get(asset_id)
        if not features:
            raise NotFoundError("Asset features not found")

        return {
            "asset_id": str(features.asset_id),
            "price": features.price,
            "market_cap": features.market_cap,
            "momentum_score": features.momentum_score,
            "volatility_score": features.volatility_score,
            "sentiment_score": features.sentiment_score,
            "updated_at": features.updated_at
        }

    def get_indices(self) -> list[dict[str, Any]]:
        results = []
        for symbol, display_name, region in INDEX_META:
            quote = self.repo.get_quote_by_symbol(symbol)
            if not quote:
                continue  # not yet ingested — skip rather than fabricate
            results.append({
                "sym": display_name,
                "region": region,
                "value": float(quote.price),
                "dayPct": self._compute_day_pct(quote.asset_id),
            })
        return results

    def get_sectors(self) -> list[dict[str, Any]]:
        sector_entries: dict[str, list[tuple[float, float]]] = {}
        for symbol, sector in SYMBOL_SECTOR_MAP.items():
            quote = self.repo.get_quote_by_symbol(symbol)
            if not quote:
                continue
            sector_entries.setdefault(sector, []).append(
                (float(quote.price), self._compute_day_pct(quote.asset_id))
            )

        total_value = sum(price for entries in sector_entries.values() for price, _ in entries)
        results = []
        for sector, entries in sector_entries.items():
            sector_value = sum(price for price, _ in entries)
            wt = (sector_value / total_value) if total_value else 0.0
            known_pcts = [pct for _, pct in entries if pct is not None]
            avg_day_pct = (sum(known_pcts) / len(known_pcts)) if known_pcts else None
            results.append({
                "name": sector,
                "wt": round(wt, 4),
                "dayPct": round(avg_day_pct, 4) if avg_day_pct is not None else None,
            })

        return sorted(results, key=lambda r: -r["wt"])

    def get_movers(self) -> dict[str, Any]:
        rows = self.repo.list_assets_with_latest_quote(exclude_asset_class="index")

        scored = []
        for asset, quote in rows:
            ex, region = infer_exchange_region(asset.symbol)
            scored.append({
                "sym": asset.symbol,
                "name": asset.name,
                "price": float(quote.price),
                "dayPct": self._compute_day_pct(quote.asset_id),
                "ex": ex,
                "region": region,
                "class": classify(asset.asset_class, asset.symbol),
                "sector": SYMBOL_SECTOR_MAP.get(asset.symbol, "General"),
            })

        scored.sort(key=lambda r: r["dayPct"] if r["dayPct"] is not None else 0.0, reverse=True)
        n = min(5, len(scored) // 2)
        gainers = scored[:n]
        losers = list(reversed(scored[-n:])) if n else []

        return {
            "gainers": gainers,
            "losers": losers
        }

    def _resolve_theme(self, theme_id: str, custom_themes: dict[str, Any]) -> dict[str, Any] | None:
        if theme_id in SYSTEM_THEMES:
            return SYSTEM_THEMES[theme_id]
        return custom_themes.get(theme_id)

    def _compute_ret1m(self, theme_id: str, custom_themes: dict[str, Any]) -> Optional[float]:
        """Real 1-month time-weighted return from get_theme_nav's price-history
        composite — replaces the old hardcoded SYSTEM_THEMES ret1m constant.
        None (not 0.0) when constituents have no price history yet, so the
        frontend can render "Unavailable" instead of a fake flat return.

        get_theme_nav's series starts at whichever constituent's earliest real
        sample is most recent, not necessarily `days` ago — a theme where every
        constituent was only just seeded would otherwise get a real but much
        shorter-than-1-month return mislabeled "1M return". Require the series
        to actually span most of the 30-day window (24+ days, allowing for
        weekends/non-trading days) before calling it a 1-month figure."""
        try:
            nav_result = self.get_theme_nav(theme_id, 30, custom_themes)
        except NotFoundError:
            return None
        nav = nav_result.get("nav") or []
        if len(nav) < 2 or (nav_result.get("span_days") or 0) < 24:
            return None
        base = nav_result.get("base") or 100
        return round((nav[-1] / base) - 1, 4)

    def list_themes(self, custom_themes: dict[str, Any], user_id: uuid.UUID) -> dict[str, Any]:
        mine_list = []
        for row in custom_themes.values():
            mine_list.append({
                "id": row["id"],
                "name": row["name"],
                "desc": row["desc"],
                "ret1m": self._compute_ret1m(row["id"], custom_themes),
                "count": len(row.get("symbols", [])),
                "inception_date": row.get("inception_date"),
                "owner_id": str(user_id),
                "forked_from": row.get("forked_from")
            })

        system_list = []
        for row in SYSTEM_THEMES.values():
            system_list.append({
                "id": row["id"],
                "name": row["name"],
                "desc": row["desc"],
                "ret1m": self._compute_ret1m(row["id"], custom_themes),
                "count": row["count"],
                "inception_date": row["inception_date"],
                "owner_id": None
            })

        return {"system": system_list, "mine": mine_list}

    def get_theme_detail(self, theme_id: str, custom_themes: dict[str, Any]) -> dict[str, Any]:
        theme = self._resolve_theme(theme_id, custom_themes)
        if not theme:
            raise NotFoundError("Theme not found")

        constituents = []
        for sym in theme["symbols"]:
            quote = self.repo.get_quote_by_symbol(sym)
            price = float(quote.price) if quote and quote.price is not None else 100.0

            asset = self.repo.get_asset_by_symbol(sym)
            name = asset.name if asset else sym
            metadata = asset.metadata_payload if asset else {}
            sector = metadata.get("sector") if isinstance(metadata, dict) else "General"

            snap = self.snapshot_repo.get(quote.asset_id) if quote else None
            rsi = float(snap.rsi) if snap and snap.rsi is not None else 50.0

            constituents.append({
                "sym": sym,
                "name": name,
                "price": price,
                "rsi": rsi,
                "sector": sector,
                "class": classify(asset.asset_class if asset else "equity", sym)
            })

        return {
            "id": theme["id"],
            "name": theme["name"],
            "desc": theme["desc"],
            "symbols": theme["symbols"],
            "weights": theme["weights"],
            "inception_date": theme["inception_date"],
            "ret1m": self._compute_ret1m(theme_id, custom_themes),
            "constituents": constituents
        }

    def get_theme_signals(self, theme_id: str, custom_themes: dict[str, Any]) -> dict[str, Any]:
        theme = self._resolve_theme(theme_id, custom_themes)
        if not theme:
            raise NotFoundError("Theme not found")

        rsis = []
        for sym in theme["symbols"]:
            quote = self.repo.get_quote_by_symbol(sym)
            if quote:
                snap = self.snapshot_repo.get(quote.asset_id)
                if snap and snap.rsi is not None:
                    rsis.append(float(snap.rsi))

        avg_rsi = sum(rsis) / len(rsis) if rsis else 55.0
        trend = "Bullish" if avg_rsi > 55 else "Bearish" if avg_rsi < 45 else "Neutral"
        conf = min(90, max(50, int(50 + abs(avg_rsi - 50))))

        # BACKLOG: macd/adx are not computed — they used to be hardcoded constants
        # (0.05 / 24.5) returned for every theme regardless of real data, which is
        # a no-fake-data violation. Real MACD/ADX are buildable now from existing
        # market.price_history (both are standard price-series indicators; RSI is
        # already computed off a price series elsewhere in this codebase — see
        # _calculate_rsi in app/modules/market/providers/market_data/yahoo/provider.py
        # — as a reference implementation for the pandas-based approach). Not built
        # in this pass; returning None so the frontend can render "Unavailable"
        # instead of a fabricated number.
        return {
            "rsi": round(avg_rsi, 1),
            "macd": None,
            "adx": None,
            "conf": conf,
            "trend": trend
        }

    def get_theme_nav(self, theme_id: str, days: int, custom_themes: dict[str, Any]) -> dict[str, Any]:
        theme = self._resolve_theme(theme_id, custom_themes)
        if not theme:
            raise NotFoundError("Theme not found")

        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        weights = theme.get("weights") or {}
        per_symbol_series: dict[str, dict[str, float]] = {}

        for sym in theme["symbols"]:
            quote = self.repo.get_quote_by_symbol(sym)
            if not quote or not quote.asset_id:
                continue
            rows = self.repo.get_price_history_since(quote.asset_id, cutoff)
            if not rows:
                continue
            by_date: dict[str, float] = {}
            for r in rows:
                by_date[r.timestamp.strftime("%Y-%m-%d")] = float(r.price)
            per_symbol_series[sym] = by_date

        if not per_symbol_series:
            raise NotFoundError("No price history available for this theme's constituents yet")

        # Renormalize weights across symbols that actually have data
        available_weight_total = sum(weights.get(sym, 0.0) for sym in per_symbol_series) or 1.0
        norm_weights = {sym: weights.get(sym, 0.0) / available_weight_total for sym in per_symbol_series}

        date_axis = sorted({d for series in per_symbol_series.values() for d in series})

        # Back-fill each symbol flat before its first real sample, forward-fill gaps after —
        # keeps every symbol's weight contributing across the whole axis so a constituent that
        # was only just seeded (one sample "today") doesn't cause an artificial jump when its
        # weight silently switches from absent to present partway through the series.
        filled_series: dict[str, dict[str, float]] = {}
        for sym, series in per_symbol_series.items():
            last = series[min(series)]
            filled: dict[str, float] = {}
            for date in date_axis:
                if date in series:
                    last = series[date]
                filled[date] = last
            filled_series[sym] = filled

        # BACKLOG: this ratio (filled_series[sym][date] / base_price[sym]) is a
        # return computed off market.price_history, which for .NS symbols spans
        # the NSE-direct cutover date (see NseDirectAdapter) — history before
        # that date is yfinance-adjusted, history after is NSE-direct raw/
        # unadjusted. A future split/bonus on an actively-tracked constituent
        # will show a real, correct price drop in the raw post-cutover data
        # that this ratio can't distinguish from an actual crash, since nothing
        # here accounts for corporate actions. Not fixed in Phase A/B — flagged
        # so a "theme NAV suddenly halved" report is diagnosed here first.
        base_price = {sym: series[date_axis[0]] for sym, series in filled_series.items()}
        nav = []
        for date in date_axis:
            composite = sum(
                norm_weights[sym] * (filled_series[sym][date] / base_price[sym])
                for sym in filled_series
            )
            nav.append(round(composite * 100, 4))

        span_days = (datetime.strptime(date_axis[-1], "%Y-%m-%d") - datetime.strptime(date_axis[0], "%Y-%m-%d")).days

        return {
            "theme_id": theme_id,
            "span_days": span_days,
            "nav": nav,
            "base": 100,
            "data_points": len(nav)
        }

    def fork_theme(self, theme_id: str, new_name: str, user: User, custom_themes: dict[str, Any]) -> MarketTheme:
        theme = self._resolve_theme(theme_id, custom_themes)
        if not theme:
            raise NotFoundError("Theme not found")

        new_id = f"fork-{uuid.uuid4().hex[:8]}"

        new_theme = MarketTheme(
            theme_id=new_id,
            name=new_name,
            desc=f"Forked from {theme['name']}",
            symbols=list(theme["symbols"]),
            ret1m=self._compute_ret1m(theme_id, custom_themes) or 0.0,
            owner_id=user.id,
            forked_from=theme_id,
            inception_date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            is_public=False
        )
        self.repo.add_theme(new_theme)

        effective_date = new_theme.inception_date
        for sym, wt in theme["weights"].items():
            self.repo.add_theme_weight(ThemeWeight(
                theme_id=new_id,
                symbol=sym,
                weight=wt,
                effective_date=effective_date
            ))
        self.repo.commit()
        return new_theme

    def update_theme(self, theme_id: str, name: Optional[str], weights: Optional[dict[str, float]], user: User) -> None:
        theme = self.repo.get_user_theme(theme_id, user.id)
        if not theme:
            raise NotFoundError("Not authorized or theme not found")

        if name is not None:
            theme.name = name
        if weights is not None:
            theme.symbols = list(weights.keys())
            self.repo.delete_theme_weights(theme_id)
            effective_date = theme.inception_date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
            for sym, wt in weights.items():
                self.repo.add_theme_weight(ThemeWeight(
                    theme_id=theme_id,
                    symbol=sym,
                    weight=wt,
                    effective_date=effective_date
                ))

        self.repo.commit()

    def delete_theme(self, theme_id: str, user: User) -> None:
        theme = self.repo.get_user_theme(theme_id, user.id)
        if not theme:
            raise NotFoundError("Not authorized or theme not found")

        self.repo.delete_theme(theme)
        self.repo.delete_theme_weights(theme_id)
        self.repo.commit()

    def get_themes_for_symbol(self, symbol: str, custom_themes: dict[str, Any]) -> list[str]:
        symbol = symbol.upper().strip()
        matched = []
        for tid, t in SYSTEM_THEMES.items():
            if symbol in t["symbols"]:
                matched.append(t["name"])

        for tid, t in custom_themes.items():
            if symbol in t.get("symbols", []):
                matched.append(t["name"])

        return matched

    def get_sector_detail(self, name: str) -> dict[str, Any]:
        # BACKLOG: this matches against the real Asset.metadata['sector'] values
        # persisted by refresh_fundamentals_task (yfinance's info.get("sector"),
        # e.g. "Technology", "Financial Services", "Consumer Defensive"). The
        # /market/sectors card list a user clicks into this from still comes from
        # the older, separate SYMBOL_SECTOR_MAP hand-curated below (get_sectors()),
        # whose labels ("IT", "Financials", "FMCG") mostly don't match the real
        # yfinance names — so most sector cards will currently land here and find
        # zero matches (correct, honest empty state — not a bug in this method),
        # not because there's no real data, but because the two sector-naming
        # sources haven't been reconciled. That reconciliation (rename
        # SYMBOL_SECTOR_MAP's labels to the real ones, or drop it in favor of
        # aggregating get_sectors() off Asset.metadata too) is a separate decision
        # not made in this pass.
        assets = self.repo.list_all_assets()
        matched = []
        for asset in assets:
            sector = (asset.metadata_payload or {}).get("sector") if isinstance(asset.metadata_payload, dict) else None
            if not sector or sector.lower() != name.lower():
                continue
            quote = self.repo.get_quote_by_symbol(asset.symbol)
            price = float(quote.price) if quote and quote.price is not None and quote.price != 0 else None
            matched.append({
                "symbol": asset.symbol,
                "name": asset.name,
                "price": price,
                "dayPct": self._compute_day_pct(quote.asset_id) if quote else None,
            })

        return {
            "sector": name,
            "constituents": matched,
            "count": len(matched)
        }

    def search(self, q: str) -> list[dict[str, Any]]:
        q_clean = q.upper().strip()
        assets = self.repo.search_assets(q_clean, q, limit=10)

        if not assets:
            # Phase D lazy on-demand tracking: no DB match, but the query
            # might be a real, not-yet-seen symbol — resolve it in the
            # background (see resolve_and_track_symbol's docstring for why
            # this must stay async: a live provider call measured 0.3-8s here
            # would block the search response the user is already looking
            # at). Dispatched from the service layer, not the API route,
            # since both /market/search and /assets ultimately call this same
            # method and shouldn't duplicate the check.
            from app.workers.ingestion.tasks import looks_like_symbol, resolve_and_track_symbol
            if looks_like_symbol(q_clean):
                resolve_and_track_symbol.delay(q_clean)

        results = []
        for a in assets:
            quote = self.repo.get_quote_by_symbol(a.symbol)
            price = float(quote.price) if quote and quote.price is not None and quote.price != 0 else None
            ex, region = infer_exchange_region(a.symbol)
            results.append({
                "sym": a.symbol,
                "name": a.name,
                "price": price,
                "dayPct": self._compute_day_pct(quote.asset_id) if quote else None,
                "ex": ex,
                "region": region,
                "class": classify(a.asset_class, a.symbol),
                "sector": (a.metadata_payload or {}).get("sector", "General")
            })
        return results

    def get_universe(self, search: Optional[str] = None) -> list[dict[str, Any]]:
        assets = self.repo.list_assets(search=search, limit=50)

        results = []
        for a in assets:
            quote = self.repo.get_quote_by_symbol(a.symbol)
            price = float(quote.price) if quote and quote.price is not None and quote.price != 0 else None
            ex, region = infer_exchange_region(a.symbol)
            results.append({
                "sym": a.symbol,
                "name": a.name,
                "price": price,
                "dayPct": self._compute_day_pct(quote.asset_id) if quote else None,
                "ex": ex,
                "region": region,
                "class": classify(a.asset_class, a.symbol),
                "sector": (a.metadata_payload or {}).get("sector", "General")
            })
        return results
