from unittest.mock import MagicMock, patch

from app.domain.services.providers.models import NormalizedQuote
from app.infrastructure.providers.polygon import PolygonAdapter


def test_polygon_quote_normalization() -> None:
    adapter = PolygonAdapter()

    fake_response = MagicMock()
    fake_response.raise_for_status.return_value = None
    fake_response.json.return_value = {"results": {"p": 234.56, "s": 1000}}

    with patch("app.infrastructure.providers.market_data.polygon.provider.settings.POLYGON_API_KEY", "test-key"), \
         patch("app.infrastructure.providers.market_data.polygon.provider.requests.get", return_value=fake_response):
        quote = adapter.get_quote("AAPL")

    assert isinstance(quote, NormalizedQuote)
    assert quote.symbol == "AAPL"
    assert quote.provider == "polygon"
    assert quote.price is not None
