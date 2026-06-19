from app.domain.services.providers.models import NormalizedQuote
from app.infrastructure.providers.polygon import PolygonAdapter


def test_polygon_quote_normalization() -> None:
    adapter = PolygonAdapter()
    quote = adapter.get_quote("AAPL")
    
    assert isinstance(quote, NormalizedQuote)
    assert quote.symbol == "AAPL"
    assert quote.provider == "polygon"
    assert quote.price is not None
