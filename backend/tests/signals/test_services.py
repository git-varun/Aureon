"""Unit tests for SignalService aggregation and signal generation logic."""

import pytest
from unittest.mock import Mock, MagicMock, patch
from datetime import datetime

from sqlalchemy.orm import Session
from app.modules.signals.services import SignalService
from app.modules.signals.models import Signal
from app.modules.signals.schemas import SignalCreate
from app.shared.interfaces import SignalPayload
from app.shared.constants import SignalType, TimeFrame
from app.modules.portfolio.models import Asset


@pytest.fixture
def mock_session():
    """Create a mock database session."""
    return MagicMock(spec=Session)


class TestSignalServiceAggregation:
    """Test suite for SignalService signal aggregation logic."""

    def test_aggregate_signals_all_buy(self, mock_session):
        """Test aggregation when all providers agree on BUY."""
        service = SignalService(mock_session)

        provider_signals = [
            SignalPayload(
                symbol="RELIANCE",
                action="BUY",
                confidence=0.9,
                provider="technical",
                rationale="RSI oversold"
            ),
            SignalPayload(
                symbol="RELIANCE",
                action="BUY",
                confidence=0.8,
                provider="fundamental",
                rationale="Low P/E ratio"
            ),
        ]

        result = service._aggregate_signals("RELIANCE", provider_signals)

        assert result is not None
        assert result["action"] == "STRONG_BUY"
        assert result["confidence"] > 0.8
        assert "Majority buy" in result["rationale"]

    def test_aggregate_signals_all_sell(self, mock_session):
        """Test aggregation when all providers agree on SELL."""
        service = SignalService(mock_session)

        provider_signals = [
            SignalPayload(
                symbol="RELIANCE",
                action="SELL",
                confidence=0.85,
                provider="technical",
                rationale="RSI overbought"
            ),
            SignalPayload(
                symbol="RELIANCE",
                action="SELL",
                confidence=0.75,
                provider="fundamental",
                rationale="High P/E ratio"
            ),
        ]

        result = service._aggregate_signals("RELIANCE", provider_signals)

        assert result is not None
        assert result["action"] == "STRONG_SELL"
        assert result["confidence"] > 0.75

    def test_aggregate_signals_mixed(self, mock_session):
        """Test aggregation with mixed signals (majority voting)."""
        service = SignalService(mock_session)

        provider_signals = [
            SignalPayload(
                symbol="RELIANCE",
                action="BUY",
                confidence=0.9,
                provider="technical",
                rationale="Strong uptrend"
            ),
            SignalPayload(
                symbol="RELIANCE",
                action="BUY",
                confidence=0.8,
                provider="fundamental",
                rationale="Cheap valuation"
            ),
            SignalPayload(
                symbol="RELIANCE",
                action="HOLD",
                confidence=0.6,
                provider="on_chain",
                rationale="Neutral signals"
            ),
        ]

        result = service._aggregate_signals("RELIANCE", provider_signals)

        assert result is not None
        # 2 BUY votes > 3 total votes * 0.5, so BUY (strong)
        assert result["action"] in ["BUY", "STRONG_BUY"]

    def test_aggregate_signals_no_majority(self, mock_session):
        """Test aggregation with conflicting signals (no majority)."""
        service = SignalService(mock_session)

        provider_signals = [
            SignalPayload(
                symbol="RELIANCE",
                action="BUY",
                confidence=0.8,
                provider="technical",
                rationale="Uptrend"
            ),
            SignalPayload(
                symbol="RELIANCE",
                action="SELL",
                confidence=0.8,
                provider="fundamental",
                rationale="Overvalued"
            ),
        ]

        result = service._aggregate_signals("RELIANCE", provider_signals)

        assert result is not None
        assert result["action"] == "HOLD"  # No majority → HOLD

    def test_aggregate_signals_empty(self, mock_session):
        """Test aggregation with no provider signals."""
        service = SignalService(mock_session)

        result = service._aggregate_signals("RELIANCE", [])

        assert result is None

    def test_risk_assessment_high(self, mock_session):
        """Test risk level aggregation picks highest risk."""
        service = SignalService(mock_session)

        provider_signals = [
            SignalPayload(
                symbol="RELIANCE",
                action="BUY",
                confidence=0.8,
                provider="technical",
                risk_level="low",
                rationale="Stable"
            ),
            SignalPayload(
                symbol="RELIANCE",
                action="BUY",
                confidence=0.7,
                provider="fundamental",
                risk_level="high",
                rationale="Volatile"
            ),
        ]

        result = service._aggregate_signals("RELIANCE", provider_signals)

        assert result["risk_level"] == "high"


class TestSignalServiceCreateAndRetrieve:
    """Test suite for SignalService CRUD operations."""

    def test_create_signal(self, mock_session):
        """Test creating and persisting a signal."""
        mock_signal = Mock(spec=Signal)
        mock_signal.id = 1
        mock_signal.symbol = "RELIANCE"
        mock_signal.signal_type = SignalType.BUY

        mock_session.add = MagicMock()
        mock_session.commit = MagicMock()
        mock_session.refresh = MagicMock()

        service = SignalService(mock_session)

        data = SignalCreate(
            symbol="RELIANCE",
            signal_type=SignalType.BUY,
            timeframe=TimeFrame.SHORT_TERM,
            confidence=0.85,
            rationale="RSI oversold",
            risk_level="medium"
        )

        # Mock the Signal constructor
        with patch("app.modules.signals.services.Signal", return_value=mock_signal):
            result = service.create_signal(data)

        assert result.id == 1

    def test_get_signal_found(self, mock_session):
        """Test retrieving an existing signal."""
        mock_signal = Mock(spec=Signal)
        mock_signal.symbol = "RELIANCE"
        mock_signal.signal_type = SignalType.BUY
        mock_signal.created_at = datetime.utcnow()

        mock_query = MagicMock()
        mock_query.filter.return_value.order_by.return_value.first.return_value = mock_signal
        mock_session.query.return_value = mock_query

        service = SignalService(mock_session)
        result = service.get_signal("RELIANCE")

        assert result == mock_signal

    def test_get_signal_not_found(self, mock_session):
        """Test retrieving a non-existent signal."""
        mock_query = MagicMock()
        mock_query.filter.return_value.order_by.return_value.first.return_value = None
        mock_session.query.return_value = mock_query

        service = SignalService(mock_session)
        result = service.get_signal("UNKNOWN")

        assert result is None

    def test_get_signals_for_symbols(self, mock_session):
        """Test retrieving signals for multiple symbols."""
        mock_signals = [Mock(spec=Signal), Mock(spec=Signal)]
        mock_signals[0].symbol = "RELIANCE"
        mock_signals[1].symbol = "INFY"

        mock_query = MagicMock()
        mock_query.filter.return_value.order_by.return_value.first.side_effect = [
            mock_signals[0],
            mock_signals[1],
            None,  # Third symbol has no signal
        ]
        mock_session.query.return_value = mock_query

        service = SignalService(mock_session)
        results = service.get_signals_for_symbols(["RELIANCE", "INFY", "TCS"])

        assert len(results) == 2


class TestSignalServiceActionConversion:
    """Test suite for action-to-SignalType conversion."""

    def test_action_to_signal_type_buy(self, mock_session):
        """Test converting BUY action to SignalType."""
        service = SignalService(mock_session)

        result = service._action_to_signal_type("BUY")
        assert result == SignalType.BUY

    def test_action_to_signal_type_strong_buy(self, mock_session):
        """Test converting STRONG_BUY action to SignalType."""
        service = SignalService(mock_session)

        result = service._action_to_signal_type("STRONG_BUY")
        assert result == SignalType.BUY

    def test_action_to_signal_type_sell(self, mock_session):
        """Test converting SELL action to SignalType."""
        service = SignalService(mock_session)

        result = service._action_to_signal_type("SELL")
        assert result == SignalType.SELL

    def test_action_to_signal_type_hold(self, mock_session):
        """Test converting HOLD action to SignalType."""
        service = SignalService(mock_session)

        result = service._action_to_signal_type("HOLD")
        assert result == SignalType.HOLD

    def test_action_to_signal_type_invalid(self, mock_session):
        """Test converting invalid action defaults to HOLD."""
        service = SignalService(mock_session)

        result = service._action_to_signal_type("INVALID")
        assert result == SignalType.HOLD


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
