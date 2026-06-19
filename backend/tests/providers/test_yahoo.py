from app.domain.services.providers.models import NormalizedQuote
from app.infrastructure.providers.yahoo import YahooAdapter


def test_yahoo_quote_normalization() -> None:
    adapter = YahooAdapter()
    quote = adapter.get_quote("AAPL")
    
    assert isinstance(quote, NormalizedQuote)
    assert quote.symbol == "AAPL"
    assert quote.provider == "yahoo"
    assert quote.price is not None
