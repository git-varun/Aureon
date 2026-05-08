"""Unit tests for signal providers (technical, fundamental, on-chain)."""

import pytest
from unittest.mock import Mock, MagicMock, patch
from datetime import datetime, timedelta

from sqlalchemy.orm import Session
from app.modules.signals.providers import (
    TechnicalSignalProvider,
    FundamentalSignalProvider,
    OnChainSignalProvider
)
from app.modules.portfolio.models import Asset, PriceHistory
from app.modules.analytics.models import Fundamentals
from app.shared.interfaces import SignalPayload


@pytest.fixture
def mock_session():
    """Create a mock database session."""
    return MagicMock(spec=Session)


@pytest.fixture
def mock_prices():
    """Create mock price data for testing."""
    prices = []
    base_price = 100.0
    for i in range(250):
        price_obj = Mock(spec=PriceHistory)
        price_obj.close = base_price + (i * 0.5)  # Trending up
        price_obj.open_price = base_price + (i * 0.48)
        price_obj.high = base_price + (i * 0.6)
        price_obj.low = base_price + (i * 0.4)
        price_obj.volume = 1_000_000
        price_obj.date = datetime.utcnow() - timedelta(days=250-i)
        prices.append(price_obj)
    return prices


class TestTechnicalSignalProvider:
    """Test suite for TechnicalSignalProvider."""

    def test_provider_name(self, mock_session):
        """Test that provider identifies itself correctly."""
        provider = TechnicalSignalProvider(mock_session)
        assert provider.provider_name == "technical"

    def test_validate_data_availability_sufficient(self, mock_session):
        """Test data availability check with sufficient prices."""
        provider = TechnicalSignalProvider(mock_session)
        mock_session.query.return_value.join.return_value.filter.return_value.count.return_value = 100

        result = provider.validate_data_availability("RELIANCE")
        assert result is True

    def test_validate_data_availability_insufficient(self, mock_session):
        """Test data availability check with insufficient prices."""
        provider = TechnicalSignalProvider(mock_session)
        mock_session.query.return_value.join.return_value.filter.return_value.count.return_value = 30

        result = provider.validate_data_availability("RELIANCE")
        assert result is False

    def test_generate_signal_insufficient_data(self, mock_session):
        """Test signal generation fails gracefully with insufficient data."""
        provider = TechnicalSignalProvider(mock_session)
        mock_session.query.return_value.join.return_value.filter.return_value.count.return_value = 10

        result = provider.generate_signal("RELIANCE", "equity")
        assert result is None

    def test_generate_signal_success(self, mock_session, mock_prices):
        """Test successful signal generation for equity."""
        provider = TechnicalSignalProvider(mock_session)

        # Mock price query (join-based chain for both availability and price fetch)
        mock_query = MagicMock()
        mock_query.join.return_value.filter.return_value.count.return_value = 100
        mock_query.join.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = mock_prices
        mock_session.query.return_value = mock_query

        result = provider.generate_signal("RELIANCE", "equity")

        assert result is not None
        assert isinstance(result, SignalPayload)
        assert result.symbol == "RELIANCE"
        assert result.provider == "technical"
        assert result.action in ["BUY", "SELL", "HOLD", "STRONG_BUY", "STRONG_SELL"]
        assert 0.0 <= result.confidence <= 1.0
        assert result.timeframe == "short_term"

    def test_analyze_trend_uptrend(self, mock_session):
        """Test trend analysis detects uptrend."""
        provider = TechnicalSignalProvider(mock_session)

        # Price above SMA50 above SMA200 = strong uptrend
        result = provider._analyze_trend(price=110, sma_50=105, sma_200=95)
        assert result == "BUY"

    def test_analyze_trend_downtrend(self, mock_session):
        """Test trend analysis detects downtrend."""
        provider = TechnicalSignalProvider(mock_session)

        # Price below SMA50 below SMA200 = strong downtrend
        result = provider._analyze_trend(price=90, sma_50=95, sma_200=105)
        assert result == "SELL"

    def test_assess_risk_low(self, mock_session):
        """Test risk assessment for low-risk conditions."""
        provider = TechnicalSignalProvider(mock_session)

        technicals = {
            "atr_14": 2.0,
            "rsi_14": 50.0
        }

        result = provider._assess_risk(technicals)
        assert result == "low"

    def test_assess_risk_high(self, mock_session):
        """Test risk assessment for high-risk conditions."""
        provider = TechnicalSignalProvider(mock_session)

        technicals = {
            "atr_14": 150.0,  # Very high
            "rsi_14": 15.0    # Extreme
        }

        result = provider._assess_risk(technicals)
        assert result == "high"

    def test_crypto_signal_generation(self, mock_session, mock_prices):
        """Test technical signal generation for cryptocurrencies."""
        provider = TechnicalSignalProvider(mock_session)

        # Mock setup (join-based chain for both availability and price fetch)
        mock_query = MagicMock()
        mock_query.join.return_value.filter.return_value.count.return_value = 100
        mock_query.join.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = mock_prices
        mock_session.query.return_value = mock_query

        result = provider.generate_signal("BTC", "crypto")

        assert result is not None
        assert result.symbol == "BTC"
        assert result.provider == "technical"


class TestFundamentalSignalProvider:
    """Test suite for FundamentalSignalProvider."""

    def test_provider_name(self, mock_session):
        """Test provider identifies itself correctly."""
        provider = FundamentalSignalProvider(mock_session)
        assert provider.provider_name == "fundamental"

    def test_validate_data_availability_with_fundamentals(self, mock_session):
        """Test data availability check when fundamentals exist."""
        provider = FundamentalSignalProvider(mock_session)
        mock_fundamentals = Mock(spec=Fundamentals)
        mock_session.query.return_value.filter.return_value.first.return_value = mock_fundamentals

        result = provider.validate_data_availability("RELIANCE")
        assert result is True

    def test_validate_data_availability_without_fundamentals(self, mock_session):
        """Test data availability check when no fundamentals exist."""
        provider = FundamentalSignalProvider(mock_session)
        mock_session.query.return_value.filter.return_value.first.return_value = None

        result = provider.validate_data_availability("UNKNOWN")
        assert result is False

    def test_generate_signal_crypto_skipped(self, mock_session):
        """Test that crypto signals are skipped by fundamental provider."""
        provider = FundamentalSignalProvider(mock_session)

        result = provider.generate_signal("BTC", "crypto")
        assert result is None

    def test_generate_signal_equity_success(self, mock_session):
        """Test successful fundamental signal generation for equity."""
        provider = FundamentalSignalProvider(mock_session)

        # Create mock fundamentals
        mock_fundamentals = Mock(spec=Fundamentals)
        mock_fundamentals.symbol = "RELIANCE"
        mock_fundamentals.pe_ratio = 20.0
        mock_fundamentals.eps = 100.0
        mock_fundamentals.market_cap = 2_000_000_000_000

        mock_session.query.return_value.filter.return_value.first.return_value = mock_fundamentals

        result = provider.generate_signal("RELIANCE", "equity")

        assert result is not None
        assert isinstance(result, SignalPayload)
        assert result.symbol == "RELIANCE"
        assert result.provider == "fundamental"
        assert result.timeframe == "long_term"
        assert result.action in ["BUY", "SELL", "HOLD"]

    def test_compute_fundamental_signal_low_pe(self, mock_session):
        """Test fundamental signal with low P/E ratio (value play)."""
        provider = FundamentalSignalProvider(mock_session)

        mock_fundamentals = Mock(spec=Fundamentals)
        mock_fundamentals.pe_ratio = 10.0
        mock_fundamentals.eps = 50.0
        mock_fundamentals.market_cap = 500_000_000_000

        action, confidence, rationale = provider._compute_fundamental_signal(mock_fundamentals)

        assert action == "BUY"
        assert confidence > 0.5
        assert "Low P/E" in rationale

    def test_compute_fundamental_signal_high_pe(self, mock_session):
        """Test fundamental signal with high P/E ratio and negative EPS (overvalued)."""
        provider = FundamentalSignalProvider(mock_session)

        mock_fundamentals = Mock(spec=Fundamentals)
        mock_fundamentals.pe_ratio = 40.0
        mock_fundamentals.eps = -5.0   # Negative EPS reinforces SELL
        mock_fundamentals.market_cap = 5_000_000_000_000

        action, confidence, rationale = provider._compute_fundamental_signal(mock_fundamentals)

        assert action == "SELL"
        assert confidence > 0.5
        assert "High P/E" in rationale


class TestOnChainSignalProvider:
    """Test suite for OnChainSignalProvider."""

    def test_provider_name(self, mock_session):
        """Test provider identifies itself correctly."""
        provider = OnChainSignalProvider(mock_session)
        assert provider.provider_name == "on_chain"

    def test_validate_data_availability_major_crypto(self, mock_session):
        """Test data availability for major cryptocurrencies."""
        provider = OnChainSignalProvider(mock_session)

        assert provider.validate_data_availability("BTC") is True
        assert provider.validate_data_availability("ETH") is True
        assert provider.validate_data_availability("SOL") is True

    def test_validate_data_availability_minor_crypto(self, mock_session):
        """Test data availability for minor cryptocurrencies (not in coverage)."""
        provider = OnChainSignalProvider(mock_session)

        assert provider.validate_data_availability("SHIB") is False

    def test_generate_signal_equity_skipped(self, mock_session):
        """Test that equity signals are skipped by on-chain provider."""
        provider = OnChainSignalProvider(mock_session)

        result = provider.generate_signal("RELIANCE", "equity")
        assert result is None

    def test_generate_signal_crypto_placeholder(self, mock_session):
        """Test on-chain signal generation returns placeholder."""
        provider = OnChainSignalProvider(mock_session)

        result = provider.generate_signal("BTC", "crypto")

        assert result is not None
        assert isinstance(result, SignalPayload)
        assert result.symbol == "BTC"
        assert result.provider == "on_chain"
        assert result.action == "HOLD"  # Placeholder returns HOLD
        assert "placeholder" in result.rationale.lower()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
