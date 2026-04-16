from typing import Optional

import yf


class HistoricalPriceProvider:
    """Fetches historical price data for correlation and beta calculations."""

    @property
    def provider_name(self) -> str:
        return "HistoricalPrices"

    def fetch(self, symbols: list, period: str = "3mo") -> Optional[dict]:
        """Fetch historical price data and return as dict."""
        try:
            import pandas as pd
            tickers = symbols + ["^NSEI"]
            df = yf.download(tickers, period=period, interval="1d", progress=False)['Close']
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)

            # Forward-fill crypto weekend gaps
            returns = df.ffill().pct_change(fill_method=None).dropna()
            return returns.to_dict()
        except Exception as e:
            logger.debug(f"Historical price fetch failed: {e}")
            return None
