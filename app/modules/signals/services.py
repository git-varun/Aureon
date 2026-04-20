"""Signals business logic: signal creation, retrieval, and provider-based generation.

SignalService orchestrates different signal providers and aggregates their results
using majority voting to produce composite signals.
"""

import logging
from datetime import datetime, timezone
from typing import List, Optional, Dict

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.modules.signals.models import Signal, SignalHistory
from app.modules.signals.schemas import SignalCreate
from app.modules.signals.providers import (
    TechnicalSignalProvider,
    FundamentalSignalProvider,
    OnChainSignalProvider
)
from app.modules.portfolio.models import Asset
from app.shared.constants import SignalType, TimeFrame
from app.shared.interfaces import SignalPayload
from app.shared.exceptions import NotFoundError

logger = logging.getLogger("signals.service")


class SignalService:
    """Compute and manage trading signals using provider-based architecture.

    This service:
    1. Coordinates multiple signal providers (technical, fundamental, on-chain)
    2. Aggregates their results using majority voting
    3. Stores composite signals in the database
    4. Provides signal retrieval and history tracking
    """

    def __init__(self, session: Session):
        """Initialize SignalService with database session.

        Initializes all signal providers.
        """
        self.session = session
        self.technical_provider = TechnicalSignalProvider(session)
        self.fundamental_provider = FundamentalSignalProvider(session)
        self.on_chain_provider = OnChainSignalProvider(session)
        logger.debug("SignalService initialised with session id=%s", id(session))

    def create_signal(self, data: SignalCreate) -> Signal:
        """Create and persist a signal in the database.

        Args:
            data: SignalCreate schema with signal details

        Returns:
            Persisted Signal ORM object
        """
        logger.debug(
            "create_signal: symbol=%s type=%s timeframe=%s confidence=%.2f risk=%s",
            data.symbol, data.signal_type, data.timeframe, data.confidence, data.risk_level
        )
        signal = Signal(**data.dict())
        self.session.add(signal)
        self.session.commit()
        self.session.refresh(signal)
        logger.info("create_signal: committed id=%s symbol=%s type=%s", signal.id, signal.symbol, signal.signal_type)
        return signal

    def get_signal(self, symbol: str) -> Optional[Signal]:
        """Get the latest signal for a symbol.

        Args:
            symbol: Asset symbol

        Returns:
            Latest Signal object or None
        """
        logger.debug("get_signal: symbol=%s", symbol)
        signal = self.session.query(Signal).filter(
            Signal.symbol == symbol
        ).order_by(desc(Signal.created_at)).first()

        if signal:
            logger.debug("get_signal: symbol=%s → id=%s type=%s created=%s",
                         symbol, signal.id, signal.signal_type, signal.created_at)
        else:
            logger.debug("get_signal: symbol=%s → no signal found", symbol)
        return signal

    def get_signals_for_symbols(self, symbols: List[str]) -> List[Signal]:
        """Get latest signals for multiple symbols.

        Args:
            symbols: List of asset symbols

        Returns:
            List of latest Signal objects (excluding symbols with no signal)
        """
        logger.debug("get_signals_for_symbols: querying %d symbols", len(symbols))
        results = [signal for symbol in symbols if (signal := self.get_signal(symbol))]
        logger.info("get_signals_for_symbols: found %d/%d signals", len(results), len(symbols))
        return results

    def generate_signal_for_symbol(self, symbol: str, asset_type: str = "equity") -> Optional[Signal]:
        """Generate a composite signal for a single symbol using all available providers.

        Uses majority voting to aggregate signals from:
        - Technical provider (RSI, MACD, trends)
        - Fundamental provider (P/E, growth) [equities only]
        - On-chain provider (whale movements, exchange flows) [crypto only]

        Args:
            symbol: Asset symbol
            asset_type: 'equity' or 'crypto'

        Returns:
            Composite Signal object or None if no providers could generate a signal
        """
        logger.info(f"generate_signal_for_symbol: symbol={symbol} asset_type={asset_type}")

        # Collect signals from all providers
        provider_signals: List[SignalPayload] = []

        # Technical signal (works for both equity and crypto)
        tech_signal = self.technical_provider.generate_signal(symbol, asset_type)
        if tech_signal:
            provider_signals.append(tech_signal)
            logger.debug(f"generate_signal_for_symbol: {symbol} technical signal: {tech_signal.action}")

        # Fundamental signal (equities only)
        if asset_type.lower() == "equity":
            fund_signal = self.fundamental_provider.generate_signal(symbol, asset_type)
            if fund_signal:
                provider_signals.append(fund_signal)
                logger.debug(f"generate_signal_for_symbol: {symbol} fundamental signal: {fund_signal.action}")

        # On-chain signal (crypto only)
        if asset_type.lower() == "crypto":
            chain_signal = self.on_chain_provider.generate_signal(symbol, asset_type)
            if chain_signal:
                provider_signals.append(chain_signal)
                logger.debug(f"generate_signal_for_symbol: {symbol} on-chain signal: {chain_signal.action}")

        if not provider_signals:
            logger.warning(f"generate_signal_for_symbol: {symbol} — no provider signals generated")
            return None

        # Aggregate signals using majority voting
        composite_signal = self._aggregate_signals(symbol, provider_signals)
        if not composite_signal:
            return None

        # Convert to Signal ORM and persist
        signal_create = SignalCreate(
            symbol=symbol,
            signal_type=self._action_to_signal_type(composite_signal["action"]),
            timeframe=TimeFrame.SHORT_TERM,
            confidence=composite_signal["confidence"],
            rationale=composite_signal["rationale"],
            risk_level=composite_signal["risk_level"],
            entry_price=None,
            exit_price=None
        )

        signal = self.create_signal(signal_create)
        logger.info(
            f"generate_signal_for_symbol: {symbol} composite signal created: "
            f"action={composite_signal['action']} confidence={composite_signal['confidence']:.2f}"
        )
        return signal

    def generate_signals_batch(self, symbols: Optional[List[str]] = None) -> List[Signal]:
        """Generate signals for multiple symbols.

        Args:
            symbols: List of symbols to generate signals for. If None, uses all assets in DB.

        Returns:
            List of newly created Signal objects
        """
        if symbols is None:
            logger.debug("generate_signals_batch: no symbols provided — querying all assets")
            assets = self.session.query(Asset).all()
            symbols = [a.symbol for a in assets]
            logger.debug("generate_signals_batch: found %d assets in DB", len(symbols))

        logger.info("generate_signals_batch: generating signals for %d symbols", len(symbols))

        generated_signals: List[Signal] = []
        for symbol in symbols:
            asset = self.session.query(Asset).filter(Asset.symbol == symbol).first()
            if not asset:
                logger.warning("generate_signals_batch: symbol=%s not found in DB — skipping", symbol)
                continue

            # Determine asset type
            asset_type = asset.asset_type.value if asset.asset_type else "equity"

            # Generate composite signal using providers
            signal = self.generate_signal_for_symbol(symbol, asset_type)
            if signal:
                generated_signals.append(signal)

        logger.info(
            "generate_signals_batch: completed — generated %d/%d signals",
            len(generated_signals), len(symbols)
        )
        return generated_signals

    def _aggregate_signals(
        self,
        symbol: str,
        provider_signals: List[SignalPayload]
    ) -> Optional[Dict]:
        """Aggregate multiple provider signals using majority voting.

        Decision logic:
        - If majority agree on BUY/SELL → use that action, confidence = avg + bonus
        - Otherwise → HOLD with base confidence

        Args:
            symbol: Asset symbol
            provider_signals: List of SignalPayload from different providers

        Returns:
            Dict with {action, confidence, rationale, risk_level} or None
        """
        if not provider_signals:
            return None

        # Count votes by action
        actions = [s.action for s in provider_signals]
        buy_votes = actions.count("BUY") + actions.count("STRONG_BUY")
        sell_votes = actions.count("SELL") + actions.count("STRONG_SELL")
        hold_votes = actions.count("HOLD")
        total_votes = len(actions)

        # Calculate average confidence
        avg_confidence = sum(s.confidence for s in provider_signals) / total_votes

        # Determine final action using majority voting
        rationales = [s.rationale for s in provider_signals if s.rationale]
        risk_levels = [s.risk_level for s in provider_signals if s.risk_level]

        if buy_votes > total_votes * 0.5:
            # Majority BUY
            action = "STRONG_BUY" if buy_votes >= total_votes * 0.75 else "BUY"
            confidence = min(0.95, avg_confidence + 0.1)  # Bonus for agreement
            rationale = f"Majority buy ({buy_votes}/{total_votes}): {'; '.join(rationales)}"
        elif sell_votes > total_votes * 0.5:
            # Majority SELL
            action = "STRONG_SELL" if sell_votes >= total_votes * 0.75 else "SELL"
            confidence = min(0.95, avg_confidence + 0.1)
            rationale = f"Majority sell ({sell_votes}/{total_votes}): {'; '.join(rationales)}"
        else:
            # No majority → HOLD
            action = "HOLD"
            confidence = avg_confidence
            rationale = f"Mixed signals ({buy_votes}B, {sell_votes}S, {hold_votes}H): {'; '.join(rationales)}"

        # Determine risk level (highest risk level wins)
        if "high" in risk_levels:
            risk_level = "high"
        elif "medium" in risk_levels:
            risk_level = "medium"
        else:
            risk_level = "low"

        logger.debug(
            f"_aggregate_signals: {symbol} action={action} confidence={confidence:.2f} "
            f"votes({buy_votes}B,{sell_votes}S,{hold_votes}H) risk={risk_level}"
        )

        return {
            "action": action,
            "confidence": confidence,
            "rationale": rationale,
            "risk_level": risk_level
        }

    def _action_to_signal_type(self, action: str) -> SignalType:
        """Convert action string to SignalType enum.

        Args:
            action: One of BUY, SELL, HOLD, STRONG_BUY, STRONG_SELL

        Returns:
            Corresponding SignalType
        """
        action_map = {
            "BUY": SignalType.BUY,
            "STRONG_BUY": SignalType.BUY,
            "SELL": SignalType.SELL,
            "STRONG_SELL": SignalType.SELL,
            "HOLD": SignalType.HOLD,
        }
        return action_map.get(action, SignalType.HOLD)

    def record_signal_exit(self, symbol: str, exit_price: float) -> Optional[SignalHistory]:
        """Record the exit of a signal (for backtesting and P&L tracking).

        Args:
            symbol: Asset symbol
            exit_price: Price at which signal was exited

        Returns:
            SignalHistory object or None if no active signal
        """
        logger.info("record_signal_exit: symbol=%s exit_price=%.4f", symbol, exit_price)

        signal = self.get_signal(symbol)
        if not signal:
            logger.warning("record_signal_exit: symbol=%s — no active signal found", symbol)
            return None

        history = SignalHistory(
            signal_id=signal.id,
            entry_date=signal.created_at,
            exit_date=datetime.now(timezone.utc),
            entry_price=signal.entry_price or 0,
            exit_price=exit_price
        )

        if signal.entry_price:
            history.profit_loss = exit_price - signal.entry_price
            history.profit_loss_percent = (history.profit_loss / signal.entry_price) * 100
            logger.info(
                "record_signal_exit: symbol=%s entry=%.4f exit=%.4f pnl=%.2f pnl_pct=%.2f%%",
                symbol, signal.entry_price, exit_price,
                history.profit_loss, history.profit_loss_percent
            )
        else:
            logger.debug("record_signal_exit: symbol=%s no entry_price on signal — pnl not computed", symbol)

        self.session.add(history)
        self.session.commit()
        self.session.refresh(history)
        logger.info("record_signal_exit: committed SignalHistory id=%s for symbol=%s", history.id, symbol)
        return history


__all__ = ["SignalService"]
