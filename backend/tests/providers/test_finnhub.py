from app.domain.services.providers.models import NormalizedQuote
from app.infrastructure.providers.finnhub import FinnhubAdapter


def test_finnhub_quote_normalization() -> None:
    adapter = FinnhubAdapter()
    quote = adapter.get_quote("AAPL")
    
    assert isinstance(quote, NormalizedQuote)
    assert quote.symbol == "AAPL"
    assert quote.provider == "finnhub"
    assert quote.price is not None
