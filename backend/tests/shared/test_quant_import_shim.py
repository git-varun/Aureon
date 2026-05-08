"""Ensures analytics shims re-export the canonical shared classes."""
import app.modules.analytics.quant as analytics_quant
import app.modules.analytics.fundamentals as analytics_fundamentals
from app.shared.quant import QuantEngine
from app.shared.fundamentals import FundamentalsEngine


def test_quant_shim_is_same_class():
    assert analytics_quant.QuantEngine is QuantEngine


def test_fundamentals_shim_is_same_class():
    assert analytics_fundamentals.FundamentalsEngine is FundamentalsEngine
