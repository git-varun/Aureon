from decimal import Decimal, InvalidOperation
from typing import List

from app.core.exceptions import ProviderError
from app.core.logging.http import http_client
from app.core.providers.capabilities import Capability
from app.core.providers.interfaces import MarketDataProvider
from app.core.providers.registry import registry
from app.core.providers.models import NormalizedNews, NormalizedQuote


def _parse_navall(text: str) -> dict[str, Decimal]:
    """Parses AMFI's semicolon-delimited NAVAll.txt into an ISIN -> NAV dict.

    Fund-house/category header lines and blank separator lines have no ';' and
    are skipped. Both ISIN columns (growth and reinvestment plans) are indexed
    to the same NAV since CDSL CAS statements aren't guaranteed to have parsed
    one specific variant.
    """
    isin_to_nav: dict[str, Decimal] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or ";" not in line:
            continue
        parts = line.split(";")
        if len(parts) < 5:
            continue
        scheme_code, isin_growth, isin_reinvestment, _scheme_name, nav_str = (
            parts[0].strip(), parts[1].strip(), parts[2].strip(), parts[3].strip(), parts[4].strip()
        )
        if scheme_code.lower() == "scheme code":
            continue
        try:
            nav = Decimal(nav_str)
        except InvalidOperation:
            continue
        for isin in (isin_growth, isin_reinvestment):
            if isin and isin != "-":
                isin_to_nav[isin] = nav
    return isin_to_nav


class AmfiAdapter(MarketDataProvider):
    """AMFI's daily NAVAll.txt is a single bulk file covering every scheme, not a
    per-symbol API — get_all_navs() is the real entry point; get_quote()/get_news()
    only exist to satisfy MarketDataProvider and are not supported (see
    NAV_INGESTION_SCOPE.md §5).
    """

    NAV_ALL_URL = "https://www.amfiindia.com/spages/NAVAll.txt"

    @property
    def provider_name(self) -> str:
        return "mfapi"

    def capabilities(self) -> List[Capability]:
        return [Capability.PRICE]

    def get_quote(self, symbol: str) -> NormalizedQuote:
        raise ProviderError(
            f"{self.provider_name} is a bulk-file provider — use get_all_navs() instead of a per-symbol get_quote()"
        )

    def get_news(self, symbol: str) -> List[NormalizedNews]:
        raise ProviderError(f"{self.provider_name} does not support news")

    def get_all_navs(self) -> dict[str, Decimal]:
        try:
            res = http_client.get(self.provider_name, self.NAV_ALL_URL, timeout=30)
            res.raise_for_status()
        except Exception as e:
            raise ProviderError(f"AMFI NAVAll.txt fetch failed: {e}") from e
        return _parse_navall(res.text)

    def health_check(self) -> bool:
        try:
            res = http_client.get(self.provider_name, self.NAV_ALL_URL, timeout=10)
            return res.status_code < 400
        except Exception:
            return False


registry.register(AmfiAdapter)
