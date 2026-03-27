from dotenv import load_dotenv

load_dotenv()

import argparse
import time
import sys
import logging
from datetime import datetime
from rich.live import Live

# 1. CONFIGURE MASTER LOGGING (Console + app.log)
log_formatter = logging.Formatter("%(asctime)s | %(levelname)s | %(name)s | %(message)s", datefmt="%H:%M:%S")

# Console handler
console_handler = logging.StreamHandler()
console_handler.setFormatter(log_formatter)

# File handler for app.log
file_handler = logging.FileHandler("app.log", encoding='utf-8')
file_handler.setFormatter(logging.Formatter("%(asctime)s | %(levelname)s | %(message)s", datefmt="%Y-%m-%d %H:%M:%S"))

# Root logger setup
logger = logging.getLogger()
logger.setLevel(logging.INFO)
logger.addHandler(console_handler)
logger.addHandler(file_handler)

# Mute noisy third-party libraries
logging.getLogger("yfinance").setLevel(logging.CRITICAL)
logging.getLogger("urllib3").setLevel(logging.WARNING)

sys_logger = logging.getLogger("System")

from engine import InvestmentEngine
from modules.ui.rich_tui import PortfolioTUI


def run_headless(engine):
    sys_logger.info("🛰️  Investment OS: Starting Headless Mode")
    while True:
        try:
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

            # 1. Sync & Enrich
            raw_assets = engine.sync_portfolio()
            assets, total_val, fx_rate = engine.enrich_portfolio(raw_assets)

            # 2. AI Intelligence & Weighted Score
            briefing = engine.generate_alpha_briefing(assets, total_val)
            weighted_score = engine.calculate_global_score(assets, briefing)

            # 3. Calculate Metrics
            total_assets = len(assets)
            stock_count = sum(1 for a in assets if a.get('type') == 'stock')
            crypto_count = sum(1 for a in assets if a.get('type') == 'crypto')
            priced_count = sum(1 for a in assets if a.get('live_price', 0) > 0)
            failed_count = total_assets - priced_count

            # 4. Telegram Hook (Upgraded for Max Info)
            telegram_status = "SKIPPED (Score too low)"
            if isinstance(briefing, dict) and abs(briefing.get('global_score', 0)) > 0.4:

                proj = briefing.get('future_projections', {})

                alert_msg = f"🏛️ *MULTI-STRATEGY BRIEFING* 🏛️\n\n"
                alert_msg += f"🔮 *30-DAY PROJECTIONS:*\n"
                alert_msg += f"• *Trend:* {proj.get('estimated_30d_trend', 'Unknown')}\n"
                alert_msg += f"• *Risk Level:* {proj.get('portfolio_risk_level', 'Unknown')}\n"
                alert_msg += f"• *Catalyst Watch:* {proj.get('catalyst_watch', 'N/A')}\n\n"

                alert_msg += f"🌍 *Macro Synthesis:*\n{briefing.get('macro_analysis', 'N/A')}\n\n"
                alert_msg += f"📋 *STRATEGIC DIRECTIVES:*\n\n"

                for d in briefing.get('directives', []):
                    if isinstance(d, dict):
                        sym = d.get('symbol', 'UNK')
                        act = d.get('action', 'HOLD')
                        tech = d.get('technical_analysis', 'N/A')
                        fund = d.get('fundamental_analysis', 'N/A')
                        the_why = d.get('the_why', '')

                        asset_data = next((a for a in assets if a['symbol'] == sym), None)
                        price = f"₹{asset_data.get('live_price', 0):,.2f}" if asset_data else "N/A"

                        alert_msg += f"🔹 *{sym}* (Live: {price})\n"
                        alert_msg += f"🚨 *Action:* {act}\n"
                        alert_msg += f"📈 *Technical:* {tech}\n"
                        alert_msg += f"🏢 *Fundamental:* {fund}\n"
                        alert_msg += f"🧠 *The Why:* {the_why}\n\n"

                # Show skipped assets so the user knows the AI didn't just ignore them
                alert_msg += f"⏭️ *MONITORED (No Action):*\n_{briefing.get('skipped_assets_summary', 'N/A')}_\n"

                engine.bot.send_telegram(alert_msg)
                telegram_status = "SENT (Status 200)"

            # 5. GENERATE THE "MAX INFO" AUDIT REPORT
            audit = f"\n[{timestamp}] 🔄 SYNC CYCLE START\n"
            audit += "-" * 65 + "\n"
            audit += "📦 INGESTION & VALUATION AUDIT:\n"
            audit += "-" * 65 + "\n"
            audit += f"{'NAME':<16} | {'TICKER':<14} | {'QTY':<8} | {'PRICE (INR)':<11} | {'STATUS'}\n"
            audit += "-" * 65 + "\n"

            # Print Table Rows
            for a in assets:
                name = a.get('name', 'Unknown')[:16]
                ticker = a.get('symbol', 'UNK')[:14]
                qty = f"{a.get('qty', 0):.3f}"
                price = f"{a.get('live_price', 0):,.2f}"
                status = "✅ LIVE" if a.get('live_price', 0) > 0 else "❌ MISSING"
                audit += f"{name:<16} | {ticker:<14} | {qty:<8} | {price:<11} | {status}\n"

            audit += "-" * 65 + "\n"
            audit += "📈 METRICS:\n"
            audit += f"   - Total Assets: {total_assets} ({stock_count} Stocks, {crypto_count} Crypto)\n"
            audit += f"   - Priced: {priced_count} | Failed: {failed_count}\n"
            audit += f"   - USD/INR FX: ₹{fx_rate:.2f}\n\n"

            audit += "🧠 INTELLIGENCE PIPELINE:\n"
            conf = briefing.get('confidence_score', 0.0) if briefing else 0.0
            raw_global = briefing.get('global_score', 0.0) if briefing else 0.0
            vibe = briefing.get('market_vibe', 'Offline') if briefing else "Offline"
            audit += f"   - AI Response: {{ \"vibe\": \"{vibe}\", \"conf\": {conf}, \"global_score\": {raw_global} }}\n"
            audit += f"   - Weighted Impact Score: {weighted_score}\n\n"

            audit += "📡 ACTION LOGS:\n"
            audit += f"   - Telegram: {telegram_status}\n"
            audit += f"   - Heartbeat: Total Portfolio Value ₹{total_val:,.2f}\n"
            audit += "-" * 65

            # Print to Terminal AND save to app.log simultaneously
            sys_logger.info(audit)

        except Exception as e:
            sys_logger.error(f"⚠️ Headless Error: {e}", exc_info=True)

        time.sleep(3600)


def run_tui(engine):
    logger.info("🖥️ Launching Terminal UI...")
    tui = PortfolioTUI()
    last_telegram_time = 0

    with Live(screen=True, auto_refresh=False) as live:
        while True:
            try:
                raw_assets = engine.sync_portfolio()
                assets, total_val, fx_rate = engine.enrich_portfolio(raw_assets)

                briefing = engine.generate_alpha_briefing(assets, total_val)
                health_report = engine.portfolio_math.analyze_health(assets, total_val)

                # Send Telegram but defensively check the data
                current_time = time.time()
                telegram_status = "SKIPPED (Score too low)"
                if isinstance(briefing, dict) and abs(briefing.get('global_score', 0)):

                    alert_msg = f"🏛️ *MULTI-STRATEGY BRIEFING* 🏛️\n\n"
                    alert_msg += f"📊 *Global Vibe:*\n{briefing.get('market_vibe', 'N/A')}\n\n"
                    alert_msg += f"🌍 *Macro Synthesis:*\n{briefing.get('macro_analysis', 'N/A')}\n\n"
                    alert_msg += f"📋 *STRATEGIC DIRECTIVES:*\n\n"

                    for d in briefing.get('directives', []):
                        if isinstance(d, dict):
                            sym = d.get('symbol', 'UNK')
                            act = d.get('action', 'HOLD')
                            rsn = d.get('reasoning', 'No reasoning provided.')
                            the_why = d.get('the_why', '')

                            asset_data = next((a for a in assets if a['symbol'] == sym), None)

                            if asset_data:
                                price = f"₹{asset_data.get('live_price', 0):,.2f}"
                                tsl = f"₹{asset_data.get('tsl', 0):,.2f}" if asset_data.get('tsl') else "N/A"
                                rsi = asset_data.get('rsi', 'N/A')

                                alert_msg += f"🔹 *{sym}* (Live: {price})\n"
                                alert_msg += f"🚨 *Action:* {act}\n"
                                alert_msg += f"🧮 *Math:* RSI {rsi} | Volatility TSL {tsl}\n"
                                alert_msg += f"🧠 *Reasoning:* {rsn}\n"
                                if the_why:
                                    alert_msg += f"📰 *The Why:* {the_why}\n"
                                alert_msg += f"\n"
                            else:
                                alert_msg += f"🔹 *{sym}* -> {act}\n📰 *Why:* {rsn}\n\n"

                    engine.bot.send_telegram(alert_msg)
                    telegram_status = "SENT (Status 200)"
                    last_telegram_time = current_time

                layout = tui.generate_layout(assets, total_val, briefing, health_report)
                live.update(layout)
                live.refresh()

            except Exception as e:
                # Log the error in the background instead of crashing the UI
                logging.getLogger("UI").error(f"Render cycle error: {e}")

            time.sleep(600)


def run_cron(engine):
    """Cloud Mode: Runs exactly once and exits."""
    sys_logger.info("☁️ Investment OS: Starting Cloud Cron Job")
    try:
        # 1. Sync & Enrich
        raw_assets = engine.sync_portfolio()
        assets, total_val, fx_rate = engine.enrich_portfolio(raw_assets)

        # 2. AI Intelligence
        briefing = engine.generate_alpha_briefing(assets, total_val)

        # 3. Always send Telegram in Cron mode (so you know it ran)
        if isinstance(briefing, dict):
            alert_msg = f"🏛️ *DAILY MULTI-STRATEGY BRIEFING* 🏛️\n\n"
            alert_msg += f"📊 *Global Vibe:*\n{briefing.get('market_vibe', 'N/A')}\n\n"
            alert_msg += f"🌍 *Macro Synthesis:*\n{briefing.get('macro_analysis', 'N/A')}\n\n"
            alert_msg += f"📋 *STRATEGIC DIRECTIVES:*\n\n"

            for d in briefing.get('directives', []):
                if isinstance(d, dict):
                    sym = d.get('symbol', 'UNK')
                    act = d.get('action', 'HOLD')
                    rsn = d.get('reasoning', '')
                    the_why = d.get('the_why', '')

                    asset_data = next((a for a in assets if a['symbol'] == sym), None)
                    if asset_data:
                        price = f"₹{asset_data.get('live_price', 0):,.2f}"
                        tsl = f"₹{asset_data.get('tsl', 0):,.2f}" if asset_data.get('tsl') else "N/A"
                        alert_msg += f"🔹 *{sym}* (Live: {price})\n🚨 *Action:* {act}\n🧮 *Math:* TSL {tsl}\n🧠 *Reasoning:* {rsn}\n📰 *The Why:* {the_why}\n\n"
                    else:
                        alert_msg += f"🔹 *{sym}* -> {act}\n📰 *Why:* {rsn}\n\n"

            engine.bot.send_telegram(alert_msg)
            sys_logger.info("✅ Daily Cloud Report Sent to Telegram.")
    except Exception as e:
        sys_logger.error(f"⚠️ Cloud Execution Error: {e}", exc_info=True)
        engine.bot.send_telegram(f"⚠️ *Investment OS Error*\nFailed to run daily cycle: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Investment OS v2.0")
    parser.add_argument("--tui", action="store_true", help="Launch TUI")
    parser.add_argument("--cron", action="store_true", help="Run once for cloud deployment")
    args = parser.parse_args()

    engine = InvestmentEngine()

    try:
        if args.tui:
            run_tui(engine)
        elif args.cron:
            run_cron(engine)
        else:
            run_headless(engine)
    except KeyboardInterrupt:
        logger.info("👋 Investment OS shutting down safely.")
        sys.exit(0)
