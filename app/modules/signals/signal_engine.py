"""
SignalEngine — unified signal computation hub.

Extracted from PipelineOrchestrator to handle:
- Price enrichment (_get_best_price, enrich_portfolio)
- AI-driven briefing generation (generate_alpha_briefing)
- News analysis (analyze_pending_news)
"""
import logging
import concurrent.futures
from typing import List, Dict, Tuple

from app.core.context_cache import smart_cache, TTL_PRICES
from app.modules.assets.services import PriceProviderService
from app.shared.quant import QuantEngine
from app.modules.analytics.fundamentals import FundamentalsEngine
from app.modules.analytics.portfolio_analytics import PortfolioAnalytics
from app.modules.signals.alt_data_engine import AltDataEngine

# Monkey-patch config to avoid circular import
try:
    from config import config
except ImportError:
    class DummyConfig:
        RISK_FREE_RATE = 0.06
        MACRO_STOP_ATR_MULTIPLIER = 3.5
    config = DummyConfig()


class SignalEngine:
    """Pure computation: enrichment, analysis, and AI briefing generation."""

    def __init__(self, price_provider_service: PriceProviderService, ai_model=None):
        self.logger = logging.getLogger("SignalEngine")
        self.price_provider_service = price_provider_service
        self.ai_model = ai_model

        # Signal computation engines
        self.quant = QuantEngine()
        self.fundamentals = FundamentalsEngine()
        self.portfolio_math = PortfolioAnalytics()
        self.alt_data = AltDataEngine()

    def _get_best_price(self, symbol, asset_type):
        """Fetch price from cache or providers (no DB write)."""
        if asset_type in ['fixed_income', 'cash'] or symbol in ['USDT-USD', 'USDC-USD', 'FDUSD-USD']:
            self.logger.debug("_get_best_price: symbol=%s type=%s → fixed at 1.0", symbol, asset_type)
            return 1.0

        cache_key = f"price_{symbol}"
        cached_price = smart_cache.get(cache_key)
        if cached_price is not None:
            self.logger.debug("_get_best_price: symbol=%s cache HIT price=%.4f", symbol, cached_price)
            return cached_price

        self.logger.debug("_get_best_price: symbol=%s cache MISS — fetching from providers", symbol)
        price_val = self.price_provider_service.fetch(symbol, asset_type)

        if price_val > 0:
            smart_cache.set(cache_key, price_val, expire=TTL_PRICES)
            self.logger.debug("_get_best_price: symbol=%s fetched price=%.4f cached ttl=%s",
                              symbol, price_val, TTL_PRICES)
        else:
            self.logger.warning("_get_best_price: symbol=%s — no price from any provider", symbol)
        return price_val

    def enrich_portfolio(self, assets: List[Dict], fx_rate: float = None) -> Tuple[List[Dict], float, float]:
        """
        Pure computation: add prices, quant, fundamentals to assets.

        Args:
            assets: Raw asset list from sync_portfolio()
            fx_rate: FX rate (USD to INR), default 83.50

        Returns:
            (enriched_assets, total_inr, fx_rate)

        Note: Caller/orchestration layer handles DB persistence of prices and technicals.
        """
        self.logger.info("🧮 Stage 2: Parallel Enrichment (Prices, Math, Fundamentals)...")

        fx_rate = fx_rate or smart_cache.get("fx_usd_inr") or 83.50
        est_total_val = sum(a.get('gross_value_inr', a.get('value_inr', 0)) for a in assets) or 100000

        def process(a):
            sym  = a['symbol']
            atype = a.get('type', 'stock')

            price = self._get_best_price(sym, atype)
            a['live_price'] = price

            fx_mult = fx_rate if "-USD" in sym or 'crypto' in atype.lower() else 1.0
            a['value_inr'] = price * a['qty'] * fx_mult

            gross_qty = sum(abs(p.get('qty', 0)) for p in a.get('positions', [])) or abs(a['qty'])
            a['gross_value_inr'] = price * gross_qty * fx_mult

            self.logger.debug(
                "enrich_portfolio[%s]: price=%.4f fx_mult=%.4f qty=%.4f value_inr=%.2f gross_inr=%.2f",
                sym, price, fx_mult, a['qty'], a['value_inr'], a['gross_value_inr']
            )

            quant_data = self.quant.analyze_asset(sym, price, est_total_val)
            fund_data  = self.fundamentals.analyze_asset(sym, atype)

            self.logger.debug("enrich_portfolio[%s]: quant_signal=%s fund_health=%s",
                              sym, quant_data.get('tv_signal', '?'), fund_data.get('fundamental_health', '?'))

            a.update(quant_data)
            a.update(fund_data)
            return a

        with concurrent.futures.ThreadPoolExecutor(max_workers=15) as executor:
            enriched_assets = list(executor.map(process, assets))

        total_inr = sum(a.get('value_inr', 0) for a in enriched_assets)
        self.logger.info("enrich_portfolio: completed %d assets total_inr=%.2f fx_rate=%.4f",
                         len(enriched_assets), total_inr, fx_rate)
        return enriched_assets, total_inr, fx_rate

    def analyze_pending_news(self, pending_articles: List[Dict] = None) -> Dict:
        """
        Analyze pending news articles with AI.

        Args:
            pending_articles: List of article dicts awaiting analysis (or None to return empty)

        Returns:
            {article_id: {bias, confidence, impact_summary}, ...}

        Note: Caller/orchestration layer handles DB persistence of results.
        """
        if not pending_articles or not self.ai_model:
            return {}

        self.logger.info(f"🧠 Batch Analyzing {len(pending_articles)} Pending News Articles...")
        results = {}
        for i in range(0, len(pending_articles), 15):
            chunk = pending_articles[i:i + 15]
            batch_res = self.ai_model.analyze_news_batch(chunk)
            if isinstance(batch_res, dict):
                results.update(batch_res)

        self.logger.info(f"✅ Analyzed {len(results)} articles via AI (no DB write yet)")
        return results

    def generate_alpha_briefing(self, assets: List[Dict], total_inr: float, latest_news_cache: Dict = None) -> Dict:
        """Generate alpha briefing from portfolio data (pure computation + external AI call)."""
        if not self.ai_model:
            return {"market_vibe": "AI Disabled", "directives": []}

        self.logger.info("🧠 Requesting AI Directives...")
        latest_news_cache = latest_news_cache or {}
        health = self.portfolio_math.analyze_health(assets, total_inr)
        alt = self.alt_data.fetch_all_alt_data()

        # Bundle context for AI
        macro_str = "Unavailable."
        bundle = f"MACRO: {macro_str}\nALT: F&G {alt.get('fear_and_greed', {}).get('value', 'N/A')} | DXY {alt.get('fii_proxy', {}).get('dxy_value', 'N/A')}\nRISK: Alloc {health.get('allocation', {})} | Beta {health.get('beta', 1.0)}\n\nASSETS:\n"

        for a in sorted(assets, key=lambda x: x.get('gross_value_inr', 0), reverse=True)[:50]:
            sym = a['symbol']
            news_array = latest_news_cache.get(sym, [])
            news_str = "None"
            if isinstance(news_array, list):
                valid_arts = [art for art in news_array if isinstance(art, dict)]
                if valid_arts:
                    news_str = "\n".join([f"-[{art.get('sentiment', {}).get('bias', 'UNRATED')}] {art.get('title', '')}" for art in valid_arts])

            bundle += (
                f"[{sym}] Qty: {a.get('qty'):.4f} | Price: {a.get('live_price')} | TV Rating: {a.get('tv_signal')}\n"
                f"Techs: RSI {a.get('momentum_rsi')} | TSL {a.get('macro_tsl')} | P/E {a.get('pe_ratio')}\n"
                f"News: {news_str}\n\n"
            )

        return self.ai_model.analyze_briefing(bundle)
