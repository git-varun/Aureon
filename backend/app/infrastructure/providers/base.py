"""Backward-compatible alias.

ProviderAdapter used to be its own ABC. It is now equivalent to
app.core.providers.interfaces.MarketDataProvider — kept as a separate import
path so `from app.infrastructure.providers.base import ProviderAdapter`
keeps working unchanged everywhere it's referenced.
"""
from app.core.providers.interfaces import MarketDataProvider as ProviderAdapter

__all__ = ["ProviderAdapter"]
