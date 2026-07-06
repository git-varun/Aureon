"""Canonical Binance exchange constants — single source of truth for stablecoin
identification and quote-asset pairing, shared by the Binance broker provider
(app/infrastructure/providers/broker/binance/provider.py), the portfolio sync
service (app/domain/services/portfolio.py), and the CSV/XLSX trade-history
importer (app/domain/services/portfolio_importer.py). Adding/removing a quote
asset only requires changing this file.
"""
from typing import Optional, Sequence

# Stablecoins Binance lists as tradable assets. Classified as asset_class=
# "stablecoin" rather than "crypto" — they're not economically volatile, so
# lumping them into "crypto" skews allocation/concentration/risk calculations.
STABLECOIN_ASSETS = ("USDT", "USDC", "BUSD", "FDUSD")

# Non-stablecoin assets Binance also allows as a trading-pair quote asset.
CRYPTO_QUOTE_ASSETS = ("BTC", "ETH", "BNB")

# Full quote-asset list for forming/parsing spot trading pairs, e.g. probing
# "{asset}{quote}" candidates when discovering trade history.
SPOT_TRADE_QUOTES = STABLECOIN_ASSETS + CRYPTO_QUOTE_ASSETS

# Internal symbol suffix per futures wallet, e.g. "BTCUSDT" -> "BTCUSDT-USDM".
WALLET_SUFFIXES = {"futures_usdm": "USDM", "futures_coinm": "COINM"}


def split_quote_asset(pair: str, quotes: Sequence[str] = SPOT_TRADE_QUOTES) -> tuple[Optional[str], Optional[str]]:
    """Strips a known quote asset off the end of a raw Binance pair, e.g.
    ("BTCUSDT", SPOT_TRADE_QUOTES) -> ("BTC", "USDT"). Returns (None, None) if
    `pair` doesn't end with any quote asset in `quotes`."""
    for quote in quotes:
        if len(pair) > len(quote) and pair.endswith(quote):
            return pair[: -len(quote)], quote
    return None, None
