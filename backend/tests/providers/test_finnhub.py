from unittest.mock import MagicMock, patch

from app.domain.services.providers.models import NormalizedQuote
from app.infrastructure.providers.finnhub import FinnhubAdapter


def test_finnhub_quote_normalization() -> None:
    adapter = FinnhubAdapter()

    fake_response = MagicMock()
    fake_response.raise_for_status.return_value = None
    fake_response.json.return_value = {"c": 234.56, "v": 1000}

    with patch("app.infrastructure.providers.market_data.finnhub.provider.settings.FINNHUB_API_KEY", "test-key"), \
         patch("app.infrastructure.providers.market_data.finnhub.provider.requests.get", return_value=fake_response):
        quote = adapter.get_quote("AAPL")

    assert isinstance(quote, NormalizedQuote)
    assert quote.symbol == "AAPL"
    assert quote.provider == "finnhub"
    assert quote.price is not None
