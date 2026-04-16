"""Portfolio context builder — formats DB data into Gemini prompt text."""

import logging
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# Hard cap to stay well within Gemini's context window
_MAX_CHARS = 8000


class PortfolioContextBuilder:
    """Builds structured text context strings from live DB state."""

    # ------------------------------------------------------------------
    # Global briefing context
    # ------------------------------------------------------------------

    def build_global_context(self, db: Session) -> str:
        """Assemble a portfolio-wide context block."""
        from app.modules.portfolio.models import Asset, Position
        from app.modules.signals.models import Signal
        from app.modules.news.models import News

        today = date.today().isoformat()

        # Fetch all positions with their assets
        positions = (
            db.query(Position)
            .join(Asset, Position.asset_id == Asset.id)
            .all()
        )

        lines = [
            "=== PORTFOLIO CONTEXT ===",
            f"Date: {today}",
            f"Total Positions: {len(positions)}",
            "",
            "--- Holdings ---",
        ]

        symbols = []
        for pos in positions:
            asset = pos.asset
            symbol = asset.symbol if asset else "UNKNOWN"
            symbols.append(symbol)

            # Fetch latest signal for this symbol
            signal = (
                db.query(Signal)
                .filter(Signal.symbol == symbol)
                .order_by(Signal.created_at.desc())
                .first()
            )
            signal_type = signal.signal_type.value if signal and signal.signal_type else "N/A"

            live_price = asset.current_price if asset and asset.current_price else 0.0
            lines.append(
                f"{symbol}: qty={pos.quantity}, avg_cost={pos.avg_buy_price:.2f}, "
                f"current={live_price:.2f}, pnl={pos.pnl_percent or 0.0:.2f}%, "
                f"signal={signal_type}"
            )

        lines.append("")
        lines.append("--- Recent News ---")

        for symbol in symbols:
            news_items = (
                db.query(News)
                .filter(News.symbols.contains(symbol))
                .order_by(News.published_at.desc())
                .limit(3)
                .all()
            )
            for item in news_items:
                lines.append(f'{symbol}: "{item.title}" ({item.source})')

        context = "\n".join(lines)

        # Truncate if over limit
        if len(context) > _MAX_CHARS:
            context = context[:_MAX_CHARS] + "\n... [truncated]"

        return context

    # ------------------------------------------------------------------
    # Single-asset context
    # ------------------------------------------------------------------

    def build_single_context(self, symbol: str, db: Session) -> str:
        """Assemble a detailed context block for a single asset."""
        from app.modules.portfolio.models import Asset, Position
        from app.modules.signals.models import Signal
        from app.modules.news.models import News
        from app.modules.analytics.models import TechnicalIndicators, Fundamentals

        today = date.today().isoformat()

        asset = db.query(Asset).filter(Asset.symbol == symbol).first()
        position = (
            db.query(Position)
            .filter(Position.asset_id == asset.id)
            .first()
            if asset
            else None
        )
        signal = (
            db.query(Signal)
            .filter(Signal.symbol == symbol)
            .order_by(Signal.created_at.desc())
            .first()
        )
        technicals = (
            db.query(TechnicalIndicators)
            .filter(TechnicalIndicators.symbol == symbol)
            .order_by(TechnicalIndicators.created_at.desc())
            .first()
        )
        fundamentals = (
            db.query(Fundamentals)
            .filter(Fundamentals.symbol == symbol)
            .order_by(Fundamentals.created_at.desc())
            .first()
        )
        news_items = (
            db.query(News)
            .filter(News.symbols.contains(symbol))
            .order_by(News.published_at.desc())
            .limit(5)
            .all()
        )

        lines = [
            f"=== SINGLE ASSET CONTEXT: {symbol} ===",
            f"Date: {today}",
            "",
        ]

        # Asset info
        if asset:
            lines += [
                "--- Asset Info ---",
                f"Name: {asset.name}",
                f"Type: {asset.asset_type.value if asset.asset_type else 'N/A'}",
                f"Exchange: {asset.exchange or 'N/A'}",
                f"Current Price: {asset.current_price or 'N/A'}",
                f"Previous Close: {asset.previous_close or 'N/A'}",
                "",
            ]

        # Position
        if position:
            lines += [
                "--- Position ---",
                f"Quantity: {position.quantity}",
                f"Avg Buy Price: {position.avg_buy_price:.2f}",
                f"Current Value: {position.current_value:.2f}",
                f"PnL: {position.pnl or 0:.2f} ({position.pnl_percent or 0:.2f}%)",
                "",
            ]

        # Signal
        if signal:
            lines += [
                "--- Latest Signal ---",
                f"Type: {signal.signal_type.value if signal.signal_type else 'N/A'}",
                f"Timeframe: {signal.timeframe.value if signal.timeframe else 'N/A'}",
                f"Confidence: {signal.confidence or 'N/A'}",
                f"Risk Level: {signal.risk_level or 'N/A'}",
                f"Rationale: {signal.rationale or 'N/A'}",
                f"Entry: {signal.entry_price or 'N/A'}  Exit: {signal.exit_price or 'N/A'}",
                "",
            ]

        # Technicals
        if technicals:
            lines += [
                "--- Technical Indicators ---",
                f"RSI: {technicals.rsi or 'N/A'}",
                f"MACD: {technicals.macd or 'N/A'}",
                f"Bollinger Upper: {technicals.bollinger_upper or 'N/A'}",
                f"Bollinger Lower: {technicals.bollinger_lower or 'N/A'}",
                f"VWAP: {technicals.vwap or 'N/A'}",
                "",
            ]

        # Fundamentals
        if fundamentals:
            lines += [
                "--- Fundamentals ---",
                f"PE Ratio: {fundamentals.pe_ratio or 'N/A'}",
                f"EPS: {fundamentals.eps or 'N/A'}",
                f"Market Cap: {fundamentals.market_cap or 'N/A'}",
                f"52W High: {fundamentals.high_52w or 'N/A'}",
                f"52W Low: {fundamentals.low_52w or 'N/A'}",
                f"Health Score: {fundamentals.health_score or 'N/A'}",
                "",
            ]

        # News
        if news_items:
            lines.append("--- Recent News ---")
            for item in news_items:
                sentiment = f" [sentiment={item.sentiment_score:.2f}]" if item.sentiment_score is not None else ""
                lines.append(f'"{item.title}" — {item.source}{sentiment}')
            lines.append("")

        context = "\n".join(lines)
        if len(context) > _MAX_CHARS:
            context = context[:_MAX_CHARS] + "\n... [truncated]"

        return context
