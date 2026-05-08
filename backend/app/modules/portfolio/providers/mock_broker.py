"""Mock broker provider — returns hardcoded holdings. Swap for real provider per broker."""
from app.shared.interfaces import AssetPayload, AssetSource

_MOCK_HOLDINGS = {
    "groww": [
        AssetPayload(symbol="TCS", qty=10.0, avg_buy_price=3200.0, source="groww", type="EQUITY"),
        AssetPayload(symbol="INFY", qty=5.0, avg_buy_price=1400.0, source="groww", type="EQUITY"),
    ],
    "zerodha": [
        AssetPayload(symbol="RELIANCE", qty=2.0, avg_buy_price=2700.0, source="zerodha", type="EQUITY"),
    ],
    "binance": [
        AssetPayload(symbol="BTC", qty=0.5, avg_buy_price=45000.0, source="binance", type="CRYPTO"),
    ],
}


class MockBrokerProvider(AssetSource):
    def __init__(self, broker: str):
        self._broker = broker

    @property
    def provider_name(self) -> str:
        return self._broker

    def validate_credentials(self) -> None:
        # Mock provider always passes credential validation.
        pass

    def fetch_holdings(self):
        return _MOCK_HOLDINGS.get(self._broker, [])


def get_broker_provider(broker: str) -> AssetSource:
    """Factory — returns the right provider for the broker name."""
    return MockBrokerProvider(broker)
