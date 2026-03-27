import logging

import pandas as pd
import yfinance as yf


class PortfolioAnalytics:
    """Calculates macro-portfolio metrics like Beta, Correlation, and Asset Allocation."""

    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.benchmark_ticker = "^NSEI"  # Nifty 50 Index

    def analyze_health(self, assets: list, total_inr: float) -> dict:
        if total_inr == 0 or not assets:
            return {"allocation": {}, "beta": 1.0, "high_correlation_warning": None}

        health_report = {}

        # 1. Asset Allocation Breakdown
        allocation = {}
        top_market_symbols = []
        for a in assets:
            atype = a.get('type', 'stock').upper()
            weight = (a.get('value_inr', 0) / total_inr) * 100
            allocation[atype] = allocation.get(atype, 0) + weight

            # Collect top symbols for math (ignore manual/fixed income)
            if weight > 5.0 and atype in ['STOCK', 'CRYPTO']:
                top_market_symbols.append(a['symbol'])

        health_report["allocation"] = {k: round(v, 2) for k, v in allocation.items()}

        # If no market assets, skip complex math
        if not top_market_symbols:
            health_report["beta"] = 0.0
            health_report["high_correlation_warning"] = None
            return health_report

        # 2. Fetch Historical Data for Correlation & Beta (Last 3 Months)
        try:
            tickers = top_market_symbols + [self.benchmark_ticker]
            df = yf.download(tickers, period="3mo", interval="1d", progress=False)['Close']

            # Handle YFinance multi-index columns
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)

            # Calculate Daily Returns (Percentage Change)
            returns = df.ffill().pct_change(fill_method=None).dropna()

            # 3. Calculate Portfolio Beta vs Nifty 50
            if self.benchmark_ticker in returns.columns:
                benchmark_var = returns[self.benchmark_ticker].var()
                portfolio_beta = 0.0

                for sym in top_market_symbols:
                    if sym in returns.columns:
                        cov = returns[sym].cov(returns[self.benchmark_ticker])
                        asset_beta = cov / benchmark_var if benchmark_var > 0 else 1.0

                        # Weight the beta by the asset's size in the portfolio
                        asset_weight = next((a.get('value_inr', 0) / total_inr for a in assets if a['symbol'] == sym),
                                            0)
                        portfolio_beta += (asset_beta * asset_weight)

                health_report["beta"] = round(portfolio_beta, 2)
            else:
                health_report["beta"] = 1.0

            # 4. Correlation Matrix Warning
            # Check if any two major assets have a correlation > 0.85 (Highly Correlated)
            corr_matrix = returns[top_market_symbols].corr()
            high_corr_pair = None

            for i in range(len(corr_matrix.columns)):
                for j in range(i + 1, len(corr_matrix.columns)):
                    if corr_matrix.iloc[i, j] > 0.85:
                        s1, s2 = corr_matrix.columns[i], corr_matrix.columns[j]
                        high_corr_pair = f"{s1} & {s2} are {round(corr_matrix.iloc[i, j] * 100, 1)}% correlated."
                        break

            health_report["high_correlation_warning"] = high_corr_pair
            health_report["correlation_matrix"] = corr_matrix.fillna(0).to_dict()

        except Exception as e:
            self.logger.error(f"Portfolio Math Error: {e}")
            health_report["beta"] = 1.0
            health_report["high_correlation_warning"] = None

        return health_report
