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

class NormalizedNews(BaseModel):
    provider: str
    title: str
    url: str
    published_at: datetime
