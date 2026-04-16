"""
High-level orchestration layer coordinating:
  providers → repositories → services → engines

No DB logic (repos handle that).
No API logic (endpoints handle that).
Only service/engine orchestration + persistence coordination.

This is the high-level PortfolioOrchestrator (moved from core/orchestration.py).
"""

import logging
from typing import List, Dict, Tuple

from services.portfolio_service import PortfolioService
from storage.repositories.news_repo import NewsRepository
from services.config.factory import build_engine

logger = logging.getLogger("Orchestration")


class PortfolioOrchestrator:
    """Orchestrate portfolio refresh, signal computation, and full cycle runs."""

    def __init__(self, config_repo=None):
        """Initialize with optional config repo (for engine binding)."""
        self.portfolio_service = PortfolioService()
        self.news_repo = NewsRepository()
        self.engine = build_engine()

    def refresh_portfolio(self, force_refresh: bool = False) -> Tuple[List[Dict], Dict, float]:
        """
        Refresh portfolio: sync prices, enrich assets, compute health.

        Returns:
            (assets, health, fx_rate)
        """
        try:
            logger.info(f"Refreshing portfolio (force_refresh={force_refresh})")

            # Load cached assets if available
            if not force_refresh:
                cached_assets = self.portfolio_service.get_portfolio_view()
                if cached_assets:
                    logger.debug(f"Using cached portfolio: {len(cached_assets)} assets")
                    assets, total_value, fx_rate = self.engine.enrich_portfolio(cached_assets)
                    # Persist enriched data (prices, technicals, fundamentals)
                    self.portfolio_service.update_from_provider(assets)
                    health = self.engine.signal_engine.portfolio_math.analyze_health(assets, total_value)
                    # Persist system state
                    self.engine.save_system_state(assets, health, {}, fx_rate)
                    logger.info(f"Portfolio refreshed (cached): {len(assets)} assets, total={total_value}, fx={fx_rate}")
                    return assets, health, fx_rate

            # Force refresh: sync from providers
            raw_assets = self.engine.sync_portfolio()
            logger.debug(f"Synced {len(raw_assets)} assets from providers")

            # Enrich with prices & calculations
            assets, total_value, fx_rate = self.engine.enrich_portfolio(raw_assets)
            logger.debug(f"Enriched portfolio: {len(assets)} assets, total={total_value}, fx={fx_rate}")

            # Persist EVERYTHING (assets, positions, prices, technicals, fundamentals)
            self.portfolio_service.update_from_provider(assets)
            logger.debug("Persisted assets and enriched data to repositories")

            # Compute health metrics
            health = self.engine.signal_engine.portfolio_math.analyze_health(assets, total_value)

            # Persist system state
            self.engine.save_system_state(assets, health, {}, fx_rate)

            logger.info(f"Portfolio refreshed: {len(assets)} assets, health={health}")
            return assets, health, fx_rate
        except Exception as e:
            logger.error(f"Portfolio refresh failed: {e}", exc_info=True)
            raise

    def compute_signals(self, assets: List[Dict], total_value: float) -> Dict:
        """
        Compute trading signals: scrape news, analyze, generate briefing.

        Args:
            assets: List of enriched assets
            total_value: Total portfolio value in INR

        Returns:
            briefing: Alpha briefing with signals and recommendations
        """
        try:
            logger.info(f"Computing signals for {len(assets)} assets")

            # Scrape latest news
            news_dict = self.engine.scrape_latest_news(assets)
            logger.debug(f"Scraped {sum(len(arts) for arts in news_dict.values())} articles")

            # Persist news articles to repository
            article_id_counter = 0
            for symbol, articles in news_dict.items():
                for article in articles:
                    try:
                        article_id = str(hash(str(article)) % (10 ** 8))  # Generate article ID
                        self.news_repo.create(
                            article_id=article_id,
                            symbol=symbol,
                            title=article.get('title', ''),
                            snippet=article.get('snippet', ''),
                            link=article.get('link', ''),
                            provider=article.get('provider', 'unknown'),
                        )
                        article_id_counter += 1
                    except Exception as e:
                        logger.debug(f"Failed to persist article: {e}")
            logger.debug(f"Persisted {article_id_counter} articles to repository")

            # Get pending news articles and analyze
            pending = self.news_repo.get_pending(limit=50)
            if pending:
                analysis = self.engine.analyze_pending_news(pending)
                logger.debug(f"Analyzed {len(analysis)} pending articles")

                # Persist analysis back to repository
                for article_id, sentiment in analysis.items():
                    try:
                        self.news_repo.update_sentiment(str(article_id), sentiment)
                    except Exception as e:
                        logger.debug(f"Failed to update sentiment for {article_id}: {e}")

            # Update latest news cache from analyzed articles
            self.engine.latest_news_cache = self._build_news_cache_from_repo(assets)

            # Generate alpha briefing
            briefing = self.engine.generate_alpha_briefing(assets, total_value)
            logger.info(f"Generated briefing with {len(briefing.get('directives', []))} signals")

            return briefing
        except Exception as e:
            logger.error(f"Signal computation failed: {e}", exc_info=True)
            raise

    def _build_news_cache_from_repo(self, assets: List[Dict]) -> Dict[str, List[Dict]]:
        """Rebuild news cache from repository (for AI briefing context)."""
        symbols = [a['symbol'] for a in assets]
        return self.news_repo.get_by_symbols(symbols, limit_per_symbol=5)

    def run_full_cycle(self, force_refresh: bool = False) -> Dict:
        """
        Run complete cycle: refresh portfolio, compute signals, generate briefing.

        Args:
            force_refresh: Force sync with all providers (slower, skips cache)

        Returns:
            {
                'assets': List[Dict],
                'health': Dict,
                'briefing': Dict,
                'fx_rate': float
            }
        """
        try:
            logger.info("Starting full portfolio cycle")

            # Stage 1: Refresh
            assets, health, fx_rate = self.refresh_portfolio(force_refresh=force_refresh)
            total_value = sum(a.get("value_inr", 0) for a in assets)

            # Stage 2: Signals
            briefing = self.compute_signals(assets, total_value)

            # Stage 3: Alert & Persist State
            self.engine.dispatch_telegram_alert(assets, briefing)
            self.engine.save_system_state(assets, health, briefing, fx_rate)

            result = {
                "assets": assets,
                "health": health,
                "briefing": briefing,
                "fx_rate": fx_rate,
            }

            logger.info("Full cycle completed successfully")
            return result
        except Exception as e:
            logger.error(f"Full cycle failed: {e}", exc_info=True)
            raise

    def get_portfolio_view(self) -> List[Dict]:
        """Get current portfolio view from repositories."""
        try:
            return self.portfolio_service.get_portfolio_view()
        except Exception as e:
            logger.error(f"Portfolio view fetch failed: {e}")
            return []

    def get_portfolio_summary(self) -> Dict:
        """Get portfolio summary (value, PnL, allocation)."""
        try:
            return self.portfolio_service.get_portfolio_summary()
        except Exception as e:
            logger.error(f"Portfolio summary fetch failed: {e}")
            return {}


"""
PipelineOrchestrator — 4-stage pipeline execution controller.

Extracted from engines/orchestrator.py to orchestrate:
- Stage 1: sync_portfolio (fetch from sources)
- Stage 2: enrich_portfolio (prices, quant, fundamentals) — delegated to SignalEngine
- Stage 3: scrape_latest_news (fetch articles)
- Stage 4: analyze_pending_news & generate_alpha_briefing — delegated to SignalEngine

This is a low-level engine orchestrator. High-level service coordination is in
services/job/orchestration.py::PortfolioOrchestrator
"""
import os
import logging
import concurrent.futures
from typing import List, Dict

from app.shared.interfaces import AssetSource, PriceProvider, NewsProvider, AIModel
from providers.price_provider_service import PriceProviderService
from providers.news_provider_service import NewsProviderService
from services.signal.signal_engine import SignalEngine
from services.notification_service import NotificationService


class PipelineOrchestrator:
    """4-stage pipeline orchestrator (low-level engine)."""

    def __init__(
        self,
        sources: List[AssetSource],
        pricers: List[PriceProvider],
        news_scrapers: List[NewsProvider],
        ai_model: AIModel,
    ):
        self.logger = logging.getLogger("PipelineOrchestrator")
        self.sources = sources
        self.pricers = pricers
        self.news_scrapers = news_scrapers
        self.ai_model = ai_model

        # Provider services: fetch from APIs only (no DB writes)
        self.price_provider_service = PriceProviderService(pricers)
        self.news_provider_service = NewsProviderService(news_scrapers)

        # Signal computation engine (delegates enrichment, analysis, briefing)
        self.signal_engine = SignalEngine(self.price_provider_service, ai_model)

        # Notification service
        self.notification_service = NotificationService()

        # In-memory news cache (caller responsible for persistence)
        self.latest_news_cache = {}

    # ==========================================
    # STARTUP
    # ==========================================
    def startup_check(self):
        """Minimal startup: ensure data directory exists."""
        self.logger.info("⚙️ Booting OS...")
        os.makedirs("data", exist_ok=True)

    # ==========================================
    # STAGE 1: INGESTION (Pure fetch, no DB)
    # ==========================================
    def sync_portfolio(self) -> List[Dict]:
        """
        Fetch holdings from broker APIs.

        Returns:
            List of asset dicts with symbol, qty, type, avg_buy_price, source, positions.
            (Caller/orchestration layer handles DB persistence)
        """
        self.logger.info("📡 Stage 1: Syncing Broker APIs...")
        all_holdings = []
        for source in self.sources:
            try:
                payloads = source.fetch_holdings()
                self.logger.info(f"📥 Orchestrator received {len(payloads)} assets from {source.__class__.__name__}")
                # Handle both Pydantic models and dicts seamlessly
                all_holdings.extend([p.model_dump() if hasattr(p, 'model_dump') else p for p in payloads])
            except Exception as e:
                self.logger.error(f"Source Failure: {e}")

        self.logger.info(f"📦 Fetched {len(all_holdings)} total assets from providers (no DB write yet)")
        return all_holdings

    # ==========================================
    # STAGE 2: ENRICHMENT (delegated to SignalEngine)
    # ==========================================
    def enrich_portfolio(self, assets: List[Dict], fx_rate: float = None):
        """
        Pure computation: add prices, quant, fundamentals to assets.
        Delegates to SignalEngine.
        """
        return self.signal_engine.enrich_portfolio(assets, fx_rate)

    # ==========================================
    # STAGE 3: NEWS SCRAPING (Pure fetch, no DB)
    # ==========================================
    def _fetch_all_headlines(self, symbol) -> List[Dict]:
        """Fetch headlines via provider service (no DB writes)."""
        articles = self.news_provider_service.fetch(symbol)
        return articles[:5] if articles else []

    def scrape_latest_news(self, assets: List[Dict]) -> Dict[str, List[Dict]]:
        """
        Fetch latest news for top assets.

        Returns:
            {symbol: [article_dict, ...]}

        Note: Caller/orchestration layer handles DB persistence.
        """
        self.logger.info("📰 Scraping Global News for Top Assets...")
        top_assets = sorted(assets, key=lambda x: x.get('gross_value_inr', 0), reverse=True)[:50]

        def fetch_news(a):
            return (a['symbol'], self._fetch_all_headlines(a['symbol']))

        with concurrent.futures.ThreadPoolExecutor(max_workers=15) as executor:
            news_results = dict(executor.map(fetch_news, top_assets))

        self.latest_news_cache.update(news_results)
        self.logger.info(f"📰 Fetched {sum(len(arts) for arts in news_results.values())} articles (no DB write yet)")
        return news_results

    # ==========================================
    # STAGE 4: NEWS ANALYSIS & BRIEFING (delegated to SignalEngine)
    # ==========================================
    def analyze_pending_news(self, pending_articles: List[Dict] = None) -> Dict:
        """Analyze pending news articles with AI. Delegates to SignalEngine."""
        return self.signal_engine.analyze_pending_news(pending_articles)

    def generate_alpha_briefing(self, assets: List[Dict], total_inr: float) -> Dict:
        """Generate alpha briefing from portfolio data. Delegates to SignalEngine."""
        return self.signal_engine.generate_alpha_briefing(assets, total_inr, self.latest_news_cache)

    def dispatch_telegram_alert(self, assets: List[Dict], briefing: Dict) -> bool:
        """Send briefing to Telegram."""
        if not isinstance(briefing, dict):
            return False

        msg = f"🏛️ *INSTITUTIONAL BRIEFING* 🏛️\n\n🌍 *Vibe:* {briefing.get('market_vibe', 'N/A')}\n\n📋 *DIRECTIVES:*\n\n"
        for d in briefing.get('directives', []):
            sym, act = d.get('symbol', 'UNK'), d.get('action', 'HOLD')
            a_data = next((a for a in assets if a['symbol'] == sym), {})
            msg += f"🔹 *{sym}* (Live: ₹{a_data.get('live_price', 0):,.2f})\n🚨 *Action:* {act}\n🧠 *Why:* {d.get('the_why', '')}\n\n"

        return self.notification_service.send_message(msg)
