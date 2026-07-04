import uuid
from datetime import datetime, timedelta, timezone

from app.core.logger import logger
from app.domain.entities.news import NewsAsset
from app.domain.services.base import BaseService
from app.infrastructure.repositories.asset_features import AssetFeaturesRepository
from app.infrastructure.repositories.asset_scores import AssetScoresRepository
from app.infrastructure.repositories.ingestion import IngestionRepository
from app.infrastructure.repositories.market import MarketRepository
from app.infrastructure.repositories.monitoring import MonitoringRepository
from app.infrastructure.repositories.news import NewsRepository
from app.infrastructure.repositories.recommendation import RecommendationRepository

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
        import yfinance as yf

        assets = self.market_repo.list_all_assets()
        if not assets:
            logger.warning("seed_price_history: no assets found, run seed_market_universe_task first")
            return 0

        total_rows = 0
        for asset in assets:
            try:
                ticker = yf.Ticker(asset.symbol)
                hist = ticker.history(period="3mo", interval="1d")
                if hist.empty:
                    logger.warning(f"seed_price_history: no history for {asset.symbol}")
                    continue

                rows = []
                for ts, row in hist.iterrows():
                    close_price = float(row["Close"])
                    volume = float(row["Volume"]) if row.get("Volume") else None
                    rows.append({
                        "id": uuid.uuid5(uuid.NAMESPACE_DNS, f"{asset.symbol}-{ts.date()}"),
                        "asset_id": asset.id,
                        "symbol": asset.symbol,
                        "price": close_price,
                        "volume": volume,
                        "timestamp": ts.to_pydatetime(),
                    })

                if rows:
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
    def __init__(self, monitoring_repo: MonitoringRepository, market_repo: MarketRepository):
        self.monitoring_repo = monitoring_repo
        self.market_repo = market_repo

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

        for r in self.monitoring_repo.list_all_recommendations():
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
