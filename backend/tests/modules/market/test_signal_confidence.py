from app.modules.market.services.assets import _signal_confidence

# Regression coverage for the SignalsTab.jsx "confidence" fix: the frontend
# used to fabricate this number from a character-code hash of the signal id.
# _signal_confidence replaces it with a deterministic function of the same
# RSI value the BUY/SELL/HOLD signal_type is derived from.


def test_buy_confidence_increases_as_rsi_drops_further_below_threshold():
    assert _signal_confidence(40.0, "BUY") == 0
    assert _signal_confidence(20.0, "BUY") == 50
    assert _signal_confidence(0.0, "BUY") == 100


def test_sell_confidence_increases_as_rsi_rises_further_above_threshold():
    assert _signal_confidence(70.0, "SELL") == 0
    assert _signal_confidence(85.0, "SELL") == 50
    assert _signal_confidence(100.0, "SELL") == 100


def test_hold_confidence_peaks_at_rsi_midpoint():
    assert _signal_confidence(55.0, "HOLD") == 100
    assert _signal_confidence(40.0, "HOLD") == 0
    assert _signal_confidence(70.0, "HOLD") == 0


def test_confidence_always_clamped_to_0_100():
    assert 0 <= _signal_confidence(0.0, "BUY") <= 100
    assert 0 <= _signal_confidence(100.0, "SELL") <= 100
    assert 0 <= _signal_confidence(55.0, "HOLD") <= 100
