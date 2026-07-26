import uuid
from datetime import datetime, timedelta, timezone

from app.core.logging import logger
from app.modules.news.entities.news import NewsAsset
from app.core.services.base import BaseService
from app.core.services.config import ConfigService
from app.core.repositories.config import ConfigRepository
from app.core.providers.factory import ProviderFactory
from app.modules.market.repositories.asset_features import AssetFeaturesRepository
from app.modules.market.repositories.asset_scores import AssetScoresRepository
from app.modules.market.repositories.ingestion import IngestionRepository
from app.modules.market.repositories.market import MarketRepository
from app.core.repositories.monitoring import MonitoringRepository
from app.modules.news.repositories.news import NewsRepository
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


# (symbol, name, asset_class) — canonical seed universe.
CANONICAL_ASSETS: list[tuple[str, str, str]] = [
    ("AAPL", "Apple Inc.", "equity"),
    ("MSFT", "Microsoft Corp.", "equity"),
    ("NVDA", "NVIDIA Corp.", "equity"),
    ("TSLA", "Tesla Inc.", "equity"),
    ("GOOGL", "Alphabet Inc.", "equity"),
    ("AMZN", "Amazon.com Inc.", "equity"),
    ("META", "Meta Platforms Inc.", "equity"),
    ("RELIANCE.NS", "Reliance Industries", "equity"),
    ("TCS.NS", "Tata Consultancy Services", "equity"),
    ("HDFCBANK.NS", "HDFC Bank", "equity"),
    ("INFY.NS", "Infosys Ltd.", "equity"),
    ("ICICIBANK.NS", "ICICI Bank", "equity"),
    ("BTC-USD", "Bitcoin", "crypto"),
    ("ETH-USD", "Ethereum", "crypto"),
    # Indices — power the real /market/indices endpoint (app/domain/services/market.py's INDEX_META)
    ("^NSEI", "NIFTY 50", "index"),
    ("^BSESN", "SENSEX", "index"),
    ("^NSEBANK", "BANK NIFTY", "index"),
    ("^CNXIT", "NIFTY IT", "index"),
    ("^GSPC", "S&P 500", "index"),
    ("^IXIC", "NASDAQ", "index"),
    ("^FTSE", "FTSE 100", "index"),
    ("^N225", "NIKKEI 225", "index"),
    # Additional equities — power real /market/sectors, /market/movers, and theme NAV
    # (app/domain/services/market.py's SYMBOL_SECTOR_MAP and SYSTEM_THEMES constituents)
    ("SBIN.NS", "State Bank of India", "equity"),
    ("LT.NS", "Larsen & Toubro", "equity"),
    ("BHEL.NS", "Bharat Heavy Electricals", "equity"),
    ("SIEMENS.NS", "Siemens Ltd", "equity"),
    ("ABB.NS", "ABB India", "equity"),
    ("WIPRO.NS", "Wipro Ltd", "equity"),
    ("HCLTECH.NS", "HCL Technologies", "equity"),
    ("ADANIGREEN.NS", "Adani Green Energy", "equity"),
    ("TATAPOWER.NS", "Tata Power", "equity"),
    ("SUZLON.NS", "Suzlon Energy", "equity"),
    ("HINDUNILVR.NS", "Hindustan Unilever", "equity"),
    ("ITC.NS", "ITC Ltd", "equity"),
    ("DABUR.NS", "Dabur India", "equity"),
    ("MARICO.NS", "Marico Ltd", "equity"),
    ("BHARTIARTL.NS", "Bharti Airtel", "equity"),
    ("ASIANPAINT.NS", "Asian Paints", "equity"),
    ("SGOV", "iShares 0-3 Month Treasury Bond ETF", "equity"),
]


class MarketSeedService(BaseService):
    def __init__(self, ingestion_repo: IngestionRepository, market_repo: MarketRepository, news_repo: NewsRepository):
        self.ingestion_repo = ingestion_repo
        self.market_repo = market_repo
        self.news_repo = news_repo
        cfg_svc = ConfigService(ConfigRepository(ingestion_repo.session))
        self.provider_factory = ProviderFactory(cfg_svc)

    def seed_market_universe(self) -> int:
        created = 0
        for symbol, name, asset_class in CANONICAL_ASSETS:
            if self.ingestion_repo.create_asset_if_missing(symbol, name, asset_class):
                created += 1
        self.ingestion_repo.session.commit()
        logger.info(f"seed_market_universe: upserted {len(CANONICAL_ASSETS)} canonical assets ({created} new)")

        self._link_existing_news()
        self.ingestion_repo.session.commit()
        return created

    def _link_existing_news(self) -> None:
        assets = self.market_repo.list_all_assets()
        asset_by_symbol = {a.symbol: a for a in assets}
        linked = 0
        for article in self.news_repo.list_all():
            syms = [s.strip() for s in (article.symbols or "").split(",") if s.strip()]
            for sym in syms:
                asset = asset_by_symbol.get(sym)
                if not asset:
                    continue
                if not self.news_repo.get_news_asset(article.id, asset.id):
                    self.news_repo.save_news_asset(NewsAsset(news_id=article.id, asset_id=asset.id))
                    linked += 1
        logger.info(f"_link_existing_news: created {linked} news_asset rows")

    def seed_price_history(self) -> int:
        assets = self.market_repo.list_all_assets()
        if not assets:
            logger.warning("seed_price_history: no assets found, run seed_market_universe_task first")
            return 0

        # Routed through ProviderFactory (not a direct yfinance call) so a
        # disabled/misconfigured Yahoo provider fails this job loudly, the
        # same way it gates refresh_prices/refresh_fundamentals, rather than
        # silently seeding nothing.
        adapter = self.provider_factory.get("yahoo")

        total_rows = 0
        for asset in assets:
            if _has_no_yahoo_coverage(asset):
                continue
            try:
                hist_rows = adapter.get_price_history(asset.symbol, period="3mo", interval="1d")
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
