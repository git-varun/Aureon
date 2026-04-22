"""Signal providers implementing different signal generation strategies.

Each provider is responsible for generating signals based on specific data sources:
- TechnicalSignalProvider: RSI, MACD, trend analysis
- FundamentalSignalProvider: P/E ratios, growth metrics
- OnChainSignalProvider: For crypto assets only
"""

import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.modules.analytics.models import Fundamentals
from app.modules.portfolio.models import Asset, PriceHistory
from app.shared.interfaces import SignalPayload, SignalProvider
from app.shared.quant import QuantEngine

logger = logging.getLogger("signal_providers")


class TechnicalSignalProvider(SignalProvider):
    """Generate signals based on technical analysis (RSI, MACD, trends).

    Works for both equities and cryptocurrencies.
    """

    def __init__(self, session: Session):
        """Initialize with database session."""
        self.session = session
        self.quant_engine = QuantEngine()

    @property
    def provider_name(self) -> str:
        return "technical"

    def validate_data_availability(self, symbol: str) -> bool:
        """Check if we have at least 50 days of price history."""
        count = (
            self.session.query(PriceHistory)
            .join(Asset, PriceHistory.asset_id == Asset.id)
            .filter(Asset.symbol == symbol)
            .count()
        )
        return count >= 50

    def generate_signal(
        self,
        symbol: str,
        asset_type: str = "equity"
    ) -> Optional[SignalPayload]:
        """Generate technical signal based on latest prices.

        Uses:
        - RSI (oversold < 30 → BUY, overbought > 70 → SELL)
        - MACD crossovers
        - Trend strength (price vs SMAs)
        - Bollinger Bands extremes

        Args:
            symbol: Asset symbol
            asset_type: 'equity' or 'crypto'

        Returns:
            SignalPayload or None if insufficient data
        """
        logger.debug(f"TechnicalSignalProvider: generating signal for {symbol}")

        if not self.validate_data_availability(symbol):
            logger.warning(f"TechnicalSignalProvider: insufficient data for {symbol}")
            return None

        try:
            # Fetch last 250 trading days of prices
            prices = (
                self.session.query(PriceHistory)
                .join(Asset, PriceHistory.asset_id == Asset.id)
                .filter(Asset.symbol == symbol)
                .order_by(PriceHistory.date.asc())
                .limit(250)
                .all()
            )

            if not prices or len(prices) < 50:
                return None

            # Compute all technical indicators
            technicals = self.quant_engine.compute_all(prices)

            # Get current price
            current_price = prices[-1].close

            # Generate signal logic
            signal_action, confidence, rationale = self._compute_technical_signal(
                technicals, current_price
            )

            if signal_action is None:
                return None

            return SignalPayload(
                symbol=symbol,
                action=signal_action,
                confidence=confidence,
                provider=self.provider_name,
                timeframe="short_term",
                rationale=rationale,
                risk_level=self._assess_risk(technicals),
                metadata={
                    "rsi": technicals.get("rsi_14"),
                    "macd": technicals.get("macd"),
                    "atr": technicals.get("atr_14"),
                }
            )

        except Exception as exc:
            logger.exception(f"TechnicalSignalProvider failed for {symbol}: {exc}")
            return None

    def _compute_technical_signal(
        self,
        technicals: dict,
        current_price: float
    ) -> tuple:
        """Compute signal action, confidence, and rationale from technicals.

        Returns:
            (action: str, confidence: float, rationale: str)
        """
        signals = []
        reasons = []

        rsi = technicals.get("rsi_14")
        macd = technicals.get("macd")
        bollinger = technicals.get("bollinger")
        sma_50 = technicals.get("sma_50")
        sma_200 = technicals.get("sma_200")

        # RSI-based signals
        if rsi is not None:
            if rsi < 30:
                signals.append("BUY")
                reasons.append(f"RSI oversold ({rsi:.1f})")
            elif rsi > 70:
                signals.append("SELL")
                reasons.append(f"RSI overbought ({rsi:.1f})")
            elif 40 < rsi < 60:
                signals.append("HOLD")
                reasons.append(f"RSI neutral ({rsi:.1f})")

        # MACD crossover signals
        if macd and macd["value"] is not None and macd["signal"] is not None:
            if macd["value"] > macd["signal"] and macd["histogram"] is not None and macd["histogram"] > 0:
                signals.append("BUY")
                reasons.append("MACD bullish crossover")
            elif macd["value"] < macd["signal"] and macd["histogram"] is not None and macd["histogram"] < 0:
                signals.append("SELL")
                reasons.append("MACD bearish crossover")

        # Trend strength (price vs SMA)
        trend_signal = self._analyze_trend(current_price, sma_50, sma_200)
        if trend_signal:
            signals.append(trend_signal)
            reasons.append(self._trend_rationale(current_price, sma_50, sma_200))

        # Bollinger Bands extremes
        if bollinger and bollinger["upper"] and bollinger["lower"]:
            if current_price < bollinger["lower"]:
                signals.append("BUY")
                reasons.append("Price below lower Bollinger Band")
            elif current_price > bollinger["upper"]:
                signals.append("SELL")
                reasons.append("Price above upper Bollinger Band")

        # Aggregate signals using majority voting
        if not signals:
            return None, 0.0, "Insufficient technical signals"

        # Count votes
        buy_votes = signals.count("BUY")
        sell_votes = signals.count("SELL")
        hold_votes = signals.count("HOLD")
        strong_buy_votes = signals.count("STRONG_BUY")
        strong_sell_votes = signals.count("STRONG_SELL")

        total_votes = len(signals)
        buy_votes += strong_buy_votes
        sell_votes += strong_sell_votes

        # Determine final signal
        if buy_votes > total_votes * 0.5:
            action = "STRONG_BUY" if buy_votes >= total_votes * 0.75 else "BUY"
            confidence = min(0.95, 0.5 + (buy_votes / total_votes * 0.5))
        elif sell_votes > total_votes * 0.5:
            action = "STRONG_SELL" if sell_votes >= total_votes * 0.75 else "SELL"
            confidence = min(0.95, 0.5 + (sell_votes / total_votes * 0.5))
        else:
            action = "HOLD"
            confidence = 0.5 + (hold_votes / total_votes * 0.3)

        rationale = "; ".join(reasons) or "Technical analysis neutral"

        return action, confidence, rationale

    def _analyze_trend(self, price: float, sma_50: Optional[float], sma_200: Optional[float]) -> Optional[str]:
        """Analyze trend strength using moving averages."""
        if sma_50 is None or sma_200 is None:
            return None

        if price > sma_50 > sma_200:
            return "BUY"
        elif price < sma_50 < sma_200:
            return "SELL"
        elif sma_50 > sma_200:
            return "HOLD"
        else:
            return "HOLD"

    def _trend_rationale(self, price: float, sma_50: Optional[float], sma_200: Optional[float]) -> str:
        """Generate trend rationale text."""
        if sma_50 is None or sma_200 is None:
            return "Trend data unavailable"

        if price > sma_50 > sma_200:
            return "Price above SMA50 > SMA200 (strong uptrend)"
        elif price < sma_50 < sma_200:
            return "Price below SMA50 < SMA200 (strong downtrend)"
        else:
            return "Mixed trend signals"

    def _assess_risk(self, technicals: dict) -> str:
        """Assess risk level from technical indicators."""
        atr = technicals.get("atr_14")
        rsi = technicals.get("rsi_14")

        # High ATR or extreme RSI = high risk
        if (atr and atr > 100) or (rsi and (rsi < 20 or rsi > 80)):
            return "high"
        elif (atr and atr > 50) or (rsi and (rsi < 30 or rsi > 70)):
            return "medium"
        else:
            return "low"


class FundamentalSignalProvider(SignalProvider):
    """Generate signals based on fundamental analysis (P/E, growth metrics).

    Works for equities only (not crypto).
    """

    def __init__(self, session: Session):
        """Initialize with database session."""
        self.session = session

    @property
    def provider_name(self) -> str:
        return "fundamental"

    def validate_data_availability(self, symbol: str) -> bool:
        """Check if we have fundamental data for the symbol."""
        fundamentals = self.session.query(Fundamentals).filter(
            Fundamentals.symbol == symbol
        ).first()
        return fundamentals is not None

    def generate_signal(
        self,
        symbol: str,
        asset_type: str = "equity"
    ) -> Optional[SignalPayload]:
        """Generate fundamental signal based on P/E, growth, valuation.

        Args:
            symbol: Asset symbol (equity only)
            asset_type: Should be 'equity'

        Returns:
            SignalPayload or None if insufficient data or crypto
        """
        if asset_type.lower() != "equity":
            logger.debug(f"FundamentalSignalProvider: skipping {symbol} (non-equity: {asset_type})")
            return None

        logger.debug(f"FundamentalSignalProvider: generating signal for {symbol}")

        if not self.validate_data_availability(symbol):
            logger.warning(f"FundamentalSignalProvider: no fundamentals for {symbol}")
            return None

        try:
            fundamentals = self.session.query(Fundamentals).filter(
                Fundamentals.symbol == symbol
            ).first()

            if not fundamentals:
                return None

            # Generate signal logic
            signal_action, confidence, rationale = self._compute_fundamental_signal(
                fundamentals
            )

            if signal_action is None:
                return None

            return SignalPayload(
                symbol=symbol,
                action=signal_action,
                confidence=confidence,
                provider=self.provider_name,
                timeframe="long_term",
                rationale=rationale,
                risk_level="medium",
                metadata={
                    "pe_ratio": fundamentals.pe_ratio,
                    "eps": fundamentals.eps,
                    "market_cap": fundamentals.market_cap,
                }
            )

        except Exception as exc:
            logger.exception(f"FundamentalSignalProvider failed for {symbol}: {exc}")
            return None

    def _compute_fundamental_signal(self, fundamentals) -> tuple:
        """Compute fundamental signal from valuation metrics.

        Returns:
            (action: str, confidence: float, rationale: str)
        """
        signals = []
        reasons = []

        pe_ratio = fundamentals.pe_ratio
        eps = fundamentals.eps
        market_cap = fundamentals.market_cap

        # P/E ratio signals
        if pe_ratio is not None:
            if pe_ratio < 15:
                signals.append("BUY")
                reasons.append(f"Low P/E ratio ({pe_ratio:.1f})")
            elif pe_ratio > 30:
                signals.append("SELL")
                reasons.append(f"High P/E ratio ({pe_ratio:.1f})")
            else:
                signals.append("HOLD")
                reasons.append(f"Fair P/E ratio ({pe_ratio:.1f})")

        # EPS signals (positive eps = profitable)
        if eps is not None:
            if eps > 0:
                signals.append("BUY")
                reasons.append(f"Positive EPS ({eps:.1f})")
            elif eps < 0:
                signals.append("SELL")
                reasons.append(f"Negative EPS ({eps:.1f})")

        # Market cap signals (growth companies vs mature)
        if market_cap is not None:
            if market_cap > 100_000_000_000:  # 100B
                signals.append("HOLD")
                reasons.append("Large-cap stability")
            else:
                signals.append("BUY")
                reasons.append("Mid-cap growth potential")

        if not signals:
            return None, 0.0, "Insufficient fundamental data"

        # Aggregate signals
        buy_votes = signals.count("BUY")
        sell_votes = signals.count("SELL")
        hold_votes = signals.count("HOLD")
        total_votes = len(signals)

        if buy_votes > total_votes * 0.5:
            action = "BUY"
            confidence = 0.5 + (buy_votes / total_votes * 0.4)
        elif sell_votes > total_votes * 0.5:
            action = "SELL"
            confidence = 0.5 + (sell_votes / total_votes * 0.4)
        else:
            action = "HOLD"
            confidence = 0.5 + (hold_votes / total_votes * 0.2)

        rationale = "; ".join(reasons) or "Fundamental analysis neutral"

        return action, confidence, rationale


class OnChainSignalProvider(SignalProvider):
    """Generate signals based on on-chain metrics for cryptocurrencies.

    Analyzes metrics like whale movements, exchange flows, MVRV ratio, etc.
    """

    def __init__(self, session: Session):
        """Initialize with database session."""
        self.session = session

    @property
    def provider_name(self) -> str:
        return "on_chain"

    def validate_data_availability(self, symbol: str) -> bool:
        """Check if we have on-chain data availability.

        For now, returns True for major cryptos (BTC, ETH, etc).
        Handles compound Binance symbols (BTC-USD-EARN-FLEX → BTC).
        """
        from app.shared.utils import extract_crypto_base_coin
        major_cryptos = {"BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "DOT", "DOGE"}
        base = extract_crypto_base_coin(symbol)
        return base in major_cryptos

    def generate_signal(
        self,
        symbol: str,
        asset_type: str = "crypto"
    ) -> Optional[SignalPayload]:
        """Generate on-chain signal for cryptocurrency.

        Placeholder implementation - would integrate with on-chain data providers
        (Glassnode, IntoTheBlock, etc.) in production.

        Args:
            symbol: Crypto symbol (e.g., BTC, ETH)
            asset_type: Should be 'crypto'

        Returns:
            SignalPayload or None
        """
        if asset_type.lower() != "crypto":
            logger.debug(f"OnChainSignalProvider: skipping {symbol} (non-crypto: {asset_type})")
            return None

        logger.debug(f"OnChainSignalProvider: generating signal for {symbol}")

        if not self.validate_data_availability(symbol):
            logger.warning(f"OnChainSignalProvider: no on-chain data for {symbol}")
            return None

        try:
            # Placeholder: Return neutral signal with on-chain data placeholder
            # In production, this would integrate with actual on-chain metrics

            return SignalPayload(
                symbol=symbol,
                action="HOLD",
                confidence=0.5,
                provider=self.provider_name,
                timeframe="medium_term",
                rationale="On-chain metrics neutral (placeholder)",
                risk_level="medium",
                metadata={
                    "note": "On-chain integration placeholder",
                    "whale_movements": None,
                    "exchange_flows": None,
                    "mvrv_ratio": None,
                }
            )

        except Exception as exc:
            logger.exception(f"OnChainSignalProvider failed for {symbol}: {exc}")
            return None
