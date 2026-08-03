import uuid
from datetime import datetime, timedelta, timezone

from app.core.logging import logger
from app.core.services.base import BaseService
from app.core.services.config import ConfigService
from app.core.repositories.config import ConfigRepository
from app.core.providers.factory import ProviderFactory
from app.modules.market.repositories.asset_features import AssetFeaturesRepository
from app.modules.market.repositories.asset_scores import AssetScoresRepository
from app.modules.market.repositories.ingestion import IngestionRepository
from app.modules.market.repositories.market import MarketRepository
from app.core.repositories.monitoring import MonitoringRepository
from app.modules.ai.repositories.recommendation import RecommendationRepository

# Mirrors app.workers.ingestion.tasks._NO_YAHOO_COVERAGE_ASSET_CLASSES — these
# asset classes have no ISIN/ticker coverage on Yahoo (NAV/value comes from
# AMFI or statement import instead), so sending them to yfinance here just
# generates a "possibly delisted" error per symbol on every run. MANUAL-
# prefixed symbols are user-entered manually-valued assets (portfolio/api/
# portfolio.py's create_manual_asset) whose asset_class is a free-text label,
# so they're excluded by symbol prefix rather than by class.
_NO_YAHOO_COVERAGE_ASSET_CLASSES = {"mutual_fund", "nps", "epf"}


def _has_no_yahoo_coverage(asset) -> bool:
    return asset.asset_class in _NO_YAHOO_COVERAGE_ASSET_CLASSES or asset.symbol.startswith("MANUAL-")


class MarketSeedService(BaseService):
    def __init__(self, ingestion_repo: IngestionRepository, market_repo: MarketRepository):
        self.ingestion_repo = ingestion_repo
        self.market_repo = market_repo
        cfg_svc = ConfigService(ConfigRepository(ingestion_repo.session))
        self.provider_factory = ProviderFactory(cfg_svc)

    def seed_price_history(self) -> int:
        assets = self.market_repo.list_all_assets()
        if not assets:
            logger.warning("seed_price_history: no assets found — nothing held or watchlisted yet")
            return 0

        # Routed through ProviderFactory (not a direct yfinance call) so a
        # disabled/misconfigured Yahoo provider fails this job loudly, the
        # same way it gates refresh_prices/refresh_fundamentals, rather than
        # silently seeding nothing. India-classified (.NS) equities prefer
        # nse_direct, falling back to yahoo — same chain as ingest_quote.
        yahoo_adapter = self.provider_factory.get("yahoo")
        nse_chain = self.provider_factory.get_fallback_chain(["nse_direct", "yahoo"])

        total_rows = 0
        for asset in assets:
            if _has_no_yahoo_coverage(asset):
                continue
            try:
                hist_rows = []
                if asset.symbol.endswith(".NS") and nse_chain:
                    for adapter in nse_chain:
                        try:
                            hist_rows = adapter.get_price_history(asset.symbol, period="3mo", interval="1d")
                            break
                        except Exception as e:
                            logger.warning(f"seed_price_history: {adapter.provider_name} failed for {asset.symbol}, trying next: {e}")
                else:
                    hist_rows = yahoo_adapter.get_price_history(asset.symbol, period="3mo", interval="1d")
                if not hist_rows:
                    logger.warning(f"seed_price_history: no history for {asset.symbol}")
                    continue

                rows = [
                    {
                        "id": uuid.uuid5(uuid.NAMESPACE_DNS, f"{asset.symbol}-{r['timestamp'].date()}"),
                        "asset_id": asset.id,
                        "symbol": asset.symbol,
                        "price": r["close"],
                        "volume": r["volume"],
                        "timestamp": r["timestamp"],
                    }
                    for r in hist_rows
                ]

                self.market_repo.bulk_insert_price_history(rows)
                self.market_repo.session.commit()
                total_rows += len(rows)
                logger.info(f"seed_price_history: {asset.symbol} — {len(rows)} rows inserted")
            except Exception as e:
                self.market_repo.session.rollback()
                logger.warning(f"seed_price_history: failed for {asset.symbol}: {e}")

        logger.info(f"seed_price_history: completed — total new rows: {total_rows}")
        return total_rows


# Known stablecoin CoinGecko ids among the live top-100-by-market-cap set —
# used to classify seeded crypto assets as asset_class "stablecoin" instead of
# "crypto" (matches classify()'s distinction and list_quoted_symbols'
# crypto_quota, which only reserves news slots for asset_class == "crypto").
# Not exhaustive by design (this list can't be, discovery is live and top-100
# membership shifts) — an unlisted stablecoin seeds as "crypto", a
# classification miss, not a data-correctness bug (price/history are still
# real either way).
_KNOWN_STABLECOIN_IDS = {
    "tether", "usd-coin", "binance-usd", "dai", "first-digital-usd",
    "true-usd", "usdd", "frax", "paypal-usd", "ethena-usde", "usds",
    "gemini-dollar",
}


def _crypto_symbol_and_class(coin: dict) -> tuple[str, str]:
    """Symbol naming for a live-discovered top-100 coin: reuse the existing
    pretty {TICKER}-USD form when this ticker is already curated in
    CoinGeckoAdapter.SYMBOL_TO_COINGECKO_ID *and* resolves to the same real
    id (keeps BTC-USD/ETH-USD/... exactly as Binance-synced holdings already
    name them) — otherwise fall back to {coingecko_id}-USD, which is always
    globally unique by construction (CoinGecko ids are 1:1 with coins;
    tickers are not — 18k+ listed coins reuse tickers, see
    SYMBOL_TO_COINGECKO_ID's module docstring) so it can never collide, at
    the cost of an uglier display symbol for less common coins. See
    CoinGeckoAdapter._coin_id for the matching read-side resolution."""
    from app.modules.market.providers.market_data.coingecko.provider import SYMBOL_TO_COINGECKO_ID

    ticker = coin["symbol"]
    coin_id = coin["id"]
    curated_id = SYMBOL_TO_COINGECKO_ID.get(ticker)
    symbol = f"{ticker}-USD" if curated_id == coin_id else f"{coin_id}-USD"
    asset_class = "stablecoin" if coin_id in _KNOWN_STABLECOIN_IDS else "crypto"
    return symbol, asset_class


class IndexUniverseSeedService(BaseService):
    """Phase D: seeds the 6 curated index-based tracked universes (Nifty 100/
    S&P 100/TOPIX 100/STOXX Europe 100/Hang Seng — static, live-verified
    constituent lists in app.modules.market.seed_universes — plus a live
    CoinGecko top-100-by-market-cap crypto universe, discovered rather than
    hardcoded). Marks every seeded Asset is_tracked=True so
    refresh_tracked_universe_task picks it up going forward, on its own
    low-frequency cadence — deliberately not folded into the hourly
    held/watchlisted refresh (list_symbols_for_quote_ingestion's scope is
    unchanged by this job)."""

    def __init__(self, ingestion_repo: IngestionRepository, market_repo: MarketRepository):
        self.ingestion_repo = ingestion_repo
        self.market_repo = market_repo
        cfg_svc = ConfigService(ConfigRepository(ingestion_repo.session))
        self.provider_factory = ProviderFactory(cfg_svc)

    def backfill_history(self, asset, symbol: str, provider_name: str) -> int:
        from app.workers.ingestion.tasks import _QUOTE_FALLBACK_CANDIDATES, _yahoo_can_serve_crypto_symbol

        candidate_names = [provider_name] + _QUOTE_FALLBACK_CANDIDATES.get(provider_name, [])
        if provider_name == "coingecko" and not _yahoo_can_serve_crypto_symbol(symbol):
            # Same reasoning as ingest_quote: yahoo can't resolve non-curated
            # CoinGecko-id-style symbols, so don't burn a doomed history call on it.
            candidate_names = [c for c in candidate_names if c != "yahoo"]
        chain = self.provider_factory.get_fallback_chain(candidate_names)
        for adapter in chain:
            try:
                hist_rows = adapter.get_price_history(symbol, period="3mo", interval="1d")
                if not hist_rows:
                    continue
                rows = [
                    {
                        "id": uuid.uuid5(uuid.NAMESPACE_DNS, f"{symbol}-{r['timestamp'].date()}"),
                        "asset_id": asset.id,
                        "symbol": symbol,
                        "price": r["close"],
                        "volume": r["volume"],
                        "timestamp": r["timestamp"],
                    }
                    for r in hist_rows
                ]
                self.market_repo.bulk_insert_price_history(rows)
                self.market_repo.session.commit()
                return len(rows)
            except Exception as e:
                self.market_repo.session.rollback()
                logger.warning(f"seed_tracked_universes: history failed for {symbol} via {adapter.provider_name}: {e}")
        return 0

    def seed_equity_universes(self) -> dict[str, dict[str, int]]:
        from app.modules.market.seed_universes import SEED_UNIVERSES
        from app.workers.ingestion.tasks import ingest_quote, resolve_quote_provider

        results: dict[str, dict[str, int]] = {}
        for universe_name, symbols in SEED_UNIVERSES.items():
            quoted, history_rows, failed = 0, 0, 0
            for symbol in symbols:
                provider_name = resolve_quote_provider(symbol, "equity")
                asset = self.ingestion_repo.ensure_tracked_asset(symbol, symbol, "equity")
                self.ingestion_repo.session.commit()
                try:
                    ingest_quote(provider_name, symbol)
                    quoted += 1
                except Exception as e:
                    failed += 1
                    logger.warning(f"seed_tracked_universes: quote failed for {symbol}: {e}")
                history_rows += self.backfill_history(asset, symbol, provider_name)
            results[universe_name] = {
                "symbols": len(symbols), "quoted": quoted, "failed": failed, "history_rows": history_rows,
            }
            logger.info(f"seed_tracked_universes: {universe_name} — {results[universe_name]}")
        return results

    def seed_crypto_top100(self, limit: int = 100, history_pace_seconds: float = 21.0) -> dict[str, int]:
        """Discovers the live top-`limit`-by-market-cap coins in a single
        CoinGecko call, seeds quotes for all of them from that one response
        (no extra per-coin call — see CoinGeckoAdapter.get_top_market_cap_coins),
        then backfills price history per-coin, explicitly paced to
        CoinGecko's live-confirmed ~3/min anonymous budget
        (history_pace_seconds default of 21s keeps every call at least that
        far apart, rather than relying on the budget guard's raise-on-exceed,
        which would otherwise turn most of a 100-coin run into logged
        failures)."""
        import time
        from app.modules.market.services.ingestion import QuoteIngestionService
        from app.core.providers.models import NormalizedQuote
        from datetime import datetime, timezone
        from decimal import Decimal

        coingecko = self.provider_factory.get("coingecko")
        coins = coingecko.get_top_market_cap_coins(limit=limit)

        quote_svc = QuoteIngestionService(self.ingestion_repo)
        quoted, failed = 0, 0
        seeded: list[tuple] = []
        for coin in coins:
            symbol, asset_class = _crypto_symbol_and_class(coin)
            asset = self.ingestion_repo.ensure_tracked_asset(symbol, coin.get("name") or symbol, asset_class)
            self.ingestion_repo.session.commit()
            price = coin.get("price")
            if price is None:
                failed += 1
                continue
            quote = NormalizedQuote(
                symbol=symbol, provider="coingecko", timestamp=datetime.now(timezone.utc),
                price=Decimal(str(price)),
            )
            try:
                quote_svc.save_quote("coingecko", quote)
                quoted += 1
                seeded.append((asset, symbol))
            except Exception as e:
                failed += 1
                logger.warning(f"seed_tracked_universes: crypto quote save failed for {symbol}: {e}")

        history_rows = 0
        for i, (asset, symbol) in enumerate(seeded):
            if i > 0:
                time.sleep(history_pace_seconds)
            history_rows += self.backfill_history(asset, symbol, "coingecko")

        result = {"symbols": len(coins), "quoted": quoted, "failed": failed, "history_rows": history_rows}
        logger.info(f"seed_tracked_universes: crypto_top100 — {result}")
        return result

    def seed_tracked_universes(self) -> dict[str, dict[str, int]]:
        results = self.seed_equity_universes()
        results["crypto_top100"] = self.seed_crypto_top100()
        logger.info(f"seed_tracked_universes: completed — {results}")
        return results


class DataQualityService(BaseService):
    def __init__(self, monitoring_repo: MonitoringRepository, market_repo: MarketRepository, recommendation_repo: RecommendationRepository):
        self.monitoring_repo = monitoring_repo
        self.market_repo = market_repo
        self.recommendation_repo = recommendation_repo

    def validate(self) -> list[str]:
        errors = []
        quotes = self.monitoring_repo.list_all_quotes()

        for q in quotes:
            if not q.asset_id:
                errors.append(f"LatestQuote {q.symbol} has no asset_id associated.")
            elif not self.market_repo.get_snapshot(q.asset_id):
                errors.append(f"LatestQuote {q.symbol} has asset_id {q.asset_id} but no AssetSnapshot exists.")

        stale_cutoff = datetime.now(timezone.utc) - timedelta(days=3)
        for q in quotes:
            if q.updated_at and q.updated_at.replace(tzinfo=timezone.utc) < stale_cutoff:
                errors.append(f"LatestQuote {q.symbol} is stale. Last updated: {q.updated_at}")

        for r in self.recommendation_repo.list_all_recommendations():
            if not self.market_repo.get_snapshot(r.asset_id):
                errors.append(f"Recommendation {r.id} references invalid/deleted asset_id {r.asset_id}.")

        return errors


class ReprocessService(BaseService):
    def __init__(self, recommendation_repo: RecommendationRepository, features_repo: AssetFeaturesRepository, scores_repo: AssetScoresRepository):
        self.recommendation_repo = recommendation_repo
        self.features_repo = features_repo
        self.scores_repo = scores_repo

    def find_assets_missing_features_or_scores(self, model_version: str = "v1.0.0") -> list[uuid.UUID]:
        missing = []
        for snap in self.recommendation_repo.list_all_snapshots():
            has_features = self.features_repo.get(snap.asset_id) is not None
            has_scores = self.scores_repo.get(snap.asset_id, model_version) is not None
            if not has_features or not has_scores:
                missing.append(snap.asset_id)
        return missing
