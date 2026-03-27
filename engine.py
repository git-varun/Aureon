import json
import concurrent.futures
import json
import logging

from modules.common.notifier import Notifier
from modules.common.portfolio_db import PortfolioDB
from modules.common.price_providers import (
    BinancePricer, CoinGeckoPricer, CoinMarketCapPricer, YFinancePricer, GoogleFinanceScraperPricer
)
from modules.common.valuator import PortfolioValuator
from modules.execution.paper_trader import PaperTrader
from modules.intelligence.alt_data_engine import AltDataEngine
from modules.intelligence.fundamentals_engine import FundamentalsEngine
from modules.intelligence.gemini_agent import GeminiFlash
from modules.intelligence.memory_engine import MemoryEngine
from modules.intelligence.news_engine import NewsEngine
from modules.intelligence.news_providers import GoogleNews, YahooFinanceNews
from modules.intelligence.portfolio_math import PortfolioAnalytics
from modules.intelligence.quant_engine import QuantEngine
from modules.sources.binance_client import BinanceSync
from modules.sources.groww_client import GrowwSync
from modules.sources.local_client import LocalAssetSync


class InvestmentEngine:
    def __init__(self):
        self.logger = logging.getLogger("Engine")

        # 1. Sources
        self.sources = [
            GrowwSync(),
            BinanceSync(),
            LocalAssetSync()
        ]

        # 2. Price Providers
        active_price_providers = [
            BinancePricer(),
            YFinancePricer(),
            CoinGeckoPricer(),
            CoinMarketCapPricer(),
            GoogleFinanceScraperPricer()
        ]

        # 3. News Providers
        active_news_providers = [GoogleNews(), YahooFinanceNews()]
        self.news_hub = NewsEngine(active_news_providers)

        # 4. Engines & Tools
        self.db = PortfolioDB()
        self.ai_brain = GeminiFlash()
        self.valuator = PortfolioValuator(active_price_providers)
        self.bot = Notifier()
        self.executor = PaperTrader()
        self.quant = QuantEngine()
        self.fundamentals = FundamentalsEngine()
        self.portfolio_math = PortfolioAnalytics()
        self.memory = MemoryEngine()
        self.alt_data = AltDataEngine()

        self.last_analysis = None
        self.latest_news_cache = {}

    def sync_portfolio(self, force_refresh=False):
        if force_refresh:
            self.logger.info("📡 Stage 1: FORCE SYNCING raw assets from broker plugins...")
            all_holdings = []
            for source in self.sources:
                try:
                    holdings = source.fetch_holdings()
                    all_holdings.extend(holdings)
                except Exception as e:
                    self.logger.error(f"⚠️ Source Failure {type(source).__name__}: {e}")

            self.db.save_assets(all_holdings)
            return all_holdings
        else:
            self.logger.info("📂 Stage 1: Loading assets from local database...")
            assets = self.db.load_assets()
            if not assets:
                self.logger.warning("Database empty. Forcing broker sync...")
                return self.sync_portfolio(force_refresh=True)
            return assets

    def enrich_portfolio(self, assets):
        self.logger.info("🧮 Stage 2: Fetching Live Prices & Quant Math (Multithreaded)...")
        total_inr = 0.0
        fx_rate = self.valuator.get_live_fx()

        def process_asset(a):
            price = self.valuator.get_price(a)
            a['live_price'] = price
            self.db.update_price(a['symbol'], price)

            a['name'] = a['symbol'].split('.')[0].replace('-USD', '')
            if "-USD" in a['symbol'] or a.get('type') == 'crypto':
                a['value_inr'] = price * a['qty'] * fx_rate
            else:
                a['value_inr'] = price * a['qty']

            quant_data = self.quant.analyze_asset(a['symbol'], price)
            fund_data = self.fundamentals.analyze_asset(a['symbol'], a.get('type', 'stock'))
            a.update(quant_data)
            a.update(fund_data)
            return a

        with concurrent.futures.ThreadPoolExecutor(max_workers=15) as executor:
            enriched_assets = list(executor.map(process_asset, assets))

        for a in enriched_assets:
            total_inr += a.get('value_inr', 0)

        return enriched_assets, total_inr, fx_rate

    def generate_alpha_briefing(self, assets, total_inr):
        self.logger.info("🧠 Stage 3: Bundling Macro, Alt Data, News, and Requesting AI Strategy...")

        health = self.portfolio_math.analyze_health(assets, total_inr)
        alt_metrics = self.alt_data.fetch_all_alt_data()

        try:
            import yfinance as yf
            import pandas as pd
            macro_df = yf.download("BZ=F ^TNX ^INDIAVIX", period="1d", progress=False)['Close']
            if isinstance(macro_df.columns, pd.MultiIndex):
                macro_df.columns = macro_df.columns.get_level_values(0)

            brent = f"${macro_df.get('BZ=F', [0]).iloc[-1]:.2f}"
            us_10y = f"{macro_df.get('^TNX', [0]).iloc[-1]:.2f}%"
            india_vix = f"{macro_df.get('^INDIAVIX', [0]).iloc[-1]:.2f}"
            macro_string = f"Brent Crude: {brent} | US 10Y Yield: {us_10y} | India VIX: {india_vix}"
        except Exception:
            macro_string = "Real-time Macro Data Unavailable."

        intel_bundle = f"GLOBAL MACRO INDICATORS:\n{macro_string}\n\n"
        intel_bundle += f"ALTERNATIVE DATA (SENTIMENT & LIQUIDITY):\n"
        intel_bundle += f"- Crypto Fear & Greed: {alt_metrics['fear_and_greed']['value']}/100\n"
        intel_bundle += f"- US Dollar Index (DXY): {alt_metrics['fii_proxy']['dxy_value']} ({alt_metrics['fii_proxy']['fii_trend']})\n\n"

        intel_bundle += f"MACRO PORTFOLIO RISK:\n"
        intel_bundle += f"- Asset Allocation: {health.get('allocation', {})}\n"
        intel_bundle += f"- Portfolio Beta: {health.get('beta', 1.0)}\n\n"

        top_assets = sorted(assets, key=lambda x: x.get('value_inr', 0), reverse=True)[:50]

        def fetch_news(asset):
            symbol = asset['symbol']
            return symbol, self.news_hub.fetch_headlines(symbol)

        with concurrent.futures.ThreadPoolExecutor(max_workers=15) as executor:
            news_results = dict(executor.map(fetch_news, top_assets))

        self.latest_news_cache = news_results

        intel_bundle += "INDIVIDUAL ASSET DATA:\n"
        for asset in top_assets:
            symbol = asset['symbol']
            price = asset.get('live_price', 0)
            headlines = news_results.get(symbol, "")

            self.memory.log_today_news(symbol, headlines, price)
            past_context = self.memory.recall_history(symbol)

            intel_bundle += (
                f"\n[{symbol}] Qty Owned: {asset.get('qty', 0):.4f} | Value: ₹{asset.get('value_inr', 0):.2f} | Price: {price} | Math Signal: {asset.get('math_signal', 'HOLD')}\n"
                f"Technicals -> RSI: {asset.get('rsi', 'N/A')} | MACD: {asset.get('macd', 'N/A')} | TSL: {asset.get('tsl', 'N/A')}\n"
                f"Fundamentals -> P/E: {asset.get('pe_ratio', 'N/A')} | 52w High: {asset.get('52w_high', 'N/A')}\n"
                f"News -> {headlines if headlines else 'No recent news.'}\n"
            )
            if past_context:
                intel_bundle += f"{past_context}\n"

        if len(top_assets) > 0:
            self.logger.info("⏳ Waiting for Gemini API Response...")
            self.last_analysis = self.ai_brain.analyze_briefing(intel_bundle)
            self.logger.info("✅ Institutional AI Strategy Received.")

            # Auto-Execution Hook (Paper Trading)
            if isinstance(self.last_analysis, dict) and 'directives' in self.last_analysis:
                for d in self.last_analysis['directives']:
                    if isinstance(d, dict):
                        sym = d.get('symbol')
                        act = d.get('action', '')
                        rsn = d.get('reasoning', '')

                        asset_data = next((a for a in assets if a['symbol'] == sym), None)
                        if asset_data and ('BUY' in act or 'SELL' in act or 'TAKE PROFIT' in act or 'AVG DOWN' in act):
                            self.executor.execute_directive(sym, act, asset_data.get('live_price', 0), rsn)

            return self.last_analysis

        return None

    def calculate_global_score(self, assets, ai_response):
        if not ai_response: return 0.0

        total_val = sum(a.get('value_inr', 0) for a in assets)
        if total_val == 0: return 0.0

        weighted_score = 0.0
        top_assets = sorted(assets, key=lambda x: x.get('value_inr', 0), reverse=True)[:5]

        for a in top_assets:
            weight = a.get('value_inr', 0) / total_val
            weighted_score += (ai_response.get('global_score', 0) * weight)

        return round(weighted_score, 2)

    def save_system_state(self, assets, health, briefing, fx):
        """Saves the entire pipeline state to the hard drive for instant UI loading."""
        state = {
            "assets": assets, "health": health, "briefing": briefing,
            "fx": fx, "news": self.latest_news_cache
        }
        with open("data/system_cache.json", "w") as f:
            json.dump(state, f)

    def generate_single_asset_intel(self, asset):
        """Generates a deep dive for one specific asset."""
        symbol = asset['symbol']
        news = self.news_hub.fetch_headlines(symbol)
        history = self.memory.recall_history(symbol)

        bundle = (
            f"Asset: {symbol} | Qty Owned: {asset.get('qty')} | Value: ₹{asset.get('value_inr')}\n"
            f"Technicals: RSI {asset.get('rsi')} | MACD {asset.get('macd')} | Bollinger Upper {asset.get('bb_upper')} / Lower {asset.get('bb_lower')}\n"
            f"Fundamentals: P/E {asset.get('pe_ratio')} | 52w High {asset.get('52w_high')} | 52w Low {asset.get('52w_low')}\n"
            f"News Feed: {news}\n"
            f"Historical Market Memory: {history}\n"
        )
        return self.ai_brain.analyze_single_asset(bundle)

    def load_system_state(self):
        """Loads the last known state instantly."""
        try:
            with open("data/system_cache.json", "r") as f:
                state = json.load(f)
                self.latest_news_cache = state.get("news", {})
                return state["assets"], state["health"], state["briefing"], state["fx"]
        except Exception:
            return None, None, None, None
