from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel


class NormalizedQuote(BaseModel):
    symbol: str
    provider: str
    timestamp: datetime
    price: Decimal
    volume: Optional[Decimal] = None
    # Real per-symbol currency, when the provider can resolve one (e.g. yahoo's
    # fast_info.currency) — an exchange suffix alone isn't reliable (confirmed
    # live: LSE quotes some symbols in GBp/pence, others in GBP or USD directly,
    # not predictable from the ".L" suffix). None for adapters that don't
    # resolve currency per-quote; infer_currency() falls back to its existing
    # suffix heuristic in that case.
    currency: Optional[str] = None

class NormalizedNews(BaseModel):
    provider: str
    title: str
    url: str
    published_at: datetime
