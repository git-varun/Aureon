"""Consolidated technical indicator computation with risk metrics.

This engine provides:
- Basic technical indicators: RSI, MACD, ATR, Bollinger Bands, SMAs, EMA, VWAP
- Advanced risk metrics: Sharpe ratio, Sortino ratio, max drawdown, beta, EWMA volatility
- Fibonacci levels, Z-score exhaustion, volume analysis
- Works with both ORM objects and raw price data

Stateless — no DB or cache dependencies. Safe to call with insufficient data.
"""

import logging
from typing import Optional, List, Dict, Any
import numpy as np
import pandas as pd
import pandas_ta  # noqa: F401 — registers the .ta accessor on pd.DataFrame

logger = logging.getLogger("quant")


class QuantEngine:
    """Compute technical indicators and risk metrics from price data.

    Consolidated implementation combining basic technical analysis with
    advanced risk metrics. All methods return None for unavailable indicators
    rather than raising exceptions (graceful degradation).
    """

    def __init__(self, risk_free_rate: float = 0.05):
        """Initialize QuantEngine with optional risk-free rate for Sharpe calculations.

        Args:
            risk_free_rate: Annual risk-free rate (default: 5%)
        """
        self.risk_free_rate = risk_free_rate

    def _sanitize_timeseries(self, df: pd.DataFrame) -> pd.DataFrame:
        """Removes Infs, fills NaNs safely, and forces float64."""
        df = df.replace([np.inf, -np.inf], np.nan)
        df = df.ffill().bfill()
        return df.astype(np.float64)

    def _safe_float(self, val, default=None) -> Optional[float]:
        """Safely convert a pandas value to float, returning default on failure."""
        try:
            f = float(val)
            if np.isnan(f) or np.isinf(f):
                return default
            return round(f, 6)
        except (TypeError, ValueError):
            return default

    def _calculate_risk_metrics(
        self,
        returns: pd.Series,
        benchmark_returns: pd.Series = None
    ) -> Dict[str, float]:
        """Calculate Sharpe, Sortino, max drawdown, beta, EWMA volatility.

        Args:
            returns: Series of daily returns
            benchmark_returns: Optional benchmark returns for beta calculation

        Returns:
            Dict with sharpe, sortino, max_drawdown, beta, ewma_vol
        """
        metrics = {
            "sharpe": 0.0,
            "sortino": 0.0,
            "max_drawdown": 0.0,
            "beta": 1.0,
            "ewma_vol": 0.0
        }

        if returns.empty or returns.std() == 0:
            logger.debug("_calculate_risk_metrics: empty or zero-std returns")
            return metrics

        try:
            daily_rf = self.risk_free_rate / 252
            excess_returns = returns - daily_rf

            # Sharpe Ratio
            metrics["sharpe"] = np.sqrt(252) * (excess_returns.mean() / returns.std())

            # Sortino Ratio
            downside_returns = returns[returns < 0]
            downside_std = downside_returns.std()
            metrics["sortino"] = (
                np.sqrt(252) * (excess_returns.mean() / downside_std)
                if downside_std > 0 else 0.0
            )

            # Max Drawdown
            cumulative_returns = (1 + returns).cumprod()
            rolling_max = cumulative_returns.cummax()
            drawdown = (cumulative_returns - rolling_max) / rolling_max
            metrics["max_drawdown"] = drawdown.min() * 100

            # EWMA Volatility (20-day, annualized)
            metrics["ewma_vol"] = returns.ewm(span=20).std().iloc[-1] * np.sqrt(252) * 100

            # Beta (vs benchmark if provided)
            if benchmark_returns is not None and not benchmark_returns.empty:
                cov = returns.cov(benchmark_returns)
                var = benchmark_returns.var()
                metrics["beta"] = (cov / var) if var > 0 else 1.0

            # Clean up NaN/Inf
            return {k: (round(v, 3) if not np.isnan(v) and not np.isinf(v) else 0.0)
                    for k, v in metrics.items()}
        except Exception as exc:
            logger.warning(f"_calculate_risk_metrics failed: {exc}")
            return metrics

    def compute_all(self, prices: List) -> Dict[str, Any]:
        """Compute all technical indicators from PriceHistory ORM objects.

        Args:
            prices: List of PriceHistory ORM objects (ordered by date ascending).
                   Each must have: .close, .open_price, .high, .low, .volume

        Returns:
            Dict with keys:
              rsi_14, macd, atr_14, atr_50, bollinger, sma_20, sma_50,
              sma_100, sma_200, ema_12, ema_105, vwap
        """
        result: Dict[str, Any] = {
            "rsi_14": None,
            "macd": None,
            "atr_14": None,
            "atr_50": None,
            "bollinger": None,
            "sma_20": None,
            "sma_50": None,
            "sma_100": None,
            "sma_200": None,
            "ema_12": None,
            "ema_105": None,
            "vwap": None,
        }

        if not prices or len(prices) < 14:
            logger.debug(f"compute_all: insufficient data ({len(prices) if prices else 0} < 14)")
            return result

        try:
            df = pd.DataFrame([
                {
                    "open": float(p.open_price) if p.open_price is not None else float(p.close),
                    "high": float(p.high) if p.high is not None else float(p.close),
                    "low": float(p.low) if p.low is not None else float(p.close),
                    "close": float(p.close),
                    "volume": float(p.volume) if p.volume is not None else 0.0,
                }
                for p in prices
            ])
        except Exception as exc:
            logger.warning(f"compute_all: failed to build DataFrame: {exc}")
            return result

        n = len(df)

        # RSI-14
        if n >= 14:
            try:
                rsi_series = df.ta.rsi(length=14)
                if rsi_series is not None and not rsi_series.empty:
                    result["rsi_14"] = self._safe_float(rsi_series.iloc[-1])
            except Exception as exc:
                logger.warning(f"compute_all: RSI failed: {exc}")

        # MACD
        if n >= 26:
            try:
                macd_df = df.ta.macd(fast=12, slow=26, signal=9)
                if macd_df is not None and not macd_df.empty:
                    result["macd"] = {
                        "value": self._safe_float(macd_df.iloc[-1, 0]),
                        "signal": self._safe_float(macd_df.iloc[-1, 2]),
                        "histogram": self._safe_float(macd_df.iloc[-1, 1]),
                    }
            except Exception as exc:
                logger.warning(f"compute_all: MACD failed: {exc}")

        # ATR-14 and ATR-50
        if n >= 14:
            try:
                atr_14_series = df.ta.atr(length=14)
                if atr_14_series is not None and not atr_14_series.empty:
                    result["atr_14"] = self._safe_float(atr_14_series.iloc[-1])
            except Exception as exc:
                logger.warning(f"compute_all: ATR-14 failed: {exc}")

        if n >= 50:
            try:
                atr_50_series = df.ta.atr(length=50)
                if atr_50_series is not None and not atr_50_series.empty:
                    result["atr_50"] = self._safe_float(atr_50_series.iloc[-1])
            except Exception as exc:
                logger.warning(f"compute_all: ATR-50 failed: {exc}")

        # Bollinger Bands
        if n >= 20:
            try:
                bb_df = df.ta.bbands(length=20, std=2)
                if bb_df is not None and not bb_df.empty:
                    result["bollinger"] = {
                        "upper": self._safe_float(bb_df.iloc[-1, 0]),
                        "middle": self._safe_float(bb_df.iloc[-1, 1]),
                        "lower": self._safe_float(bb_df.iloc[-1, 2]),
                    }
            except Exception as exc:
                logger.warning(f"compute_all: Bollinger failed: {exc}")

        # Moving Averages
        if n >= 20:
            try:
                sma_20_series = df.ta.sma(length=20)
                if sma_20_series is not None and not sma_20_series.empty:
                    result["sma_20"] = self._safe_float(sma_20_series.iloc[-1])
            except Exception as exc:
                logger.warning(f"compute_all: SMA-20 failed: {exc}")

        if n >= 50:
            try:
                sma_50_series = df.ta.sma(length=50)
                if sma_50_series is not None and not sma_50_series.empty:
                    result["sma_50"] = self._safe_float(sma_50_series.iloc[-1])
            except Exception as exc:
                logger.warning(f"compute_all: SMA-50 failed: {exc}")

        if n >= 100:
            try:
                sma_100_series = df.ta.sma(length=100)
                if sma_100_series is not None and not sma_100_series.empty:
                    result["sma_100"] = self._safe_float(sma_100_series.iloc[-1])
            except Exception as exc:
                logger.warning(f"compute_all: SMA-100 failed: {exc}")

        if n >= 200:
            try:
                sma_200_series = df.ta.sma(length=200)
                if sma_200_series is not None and not sma_200_series.empty:
                    result["sma_200"] = self._safe_float(sma_200_series.iloc[-1])
            except Exception as exc:
                logger.warning(f"compute_all: SMA-200 failed: {exc}")

        # Exponential Moving Averages
        if n >= 12:
            try:
                ema_12_series = df.ta.ema(length=12)
                if ema_12_series is not None and not ema_12_series.empty:
                    result["ema_12"] = self._safe_float(ema_12_series.iloc[-1])
            except Exception as exc:
                logger.warning(f"compute_all: EMA-12 failed: {exc}")

        if n >= 105:
            try:
                ema_105_series = df.ta.ema(length=105)
                if ema_105_series is not None and not ema_105_series.empty:
                    result["ema_105"] = self._safe_float(ema_105_series.iloc[-1])
            except Exception as exc:
                logger.warning(f"compute_all: EMA-105 failed: {exc}")

        # VWAP (Volume-Weighted Average Price) - 20 day
        if n >= 20:
            try:
                vol_sum = df["volume"].rolling(window=20).sum().replace(0, np.nan)
                vwap = (df["close"] * df["volume"]).rolling(window=20).sum() / vol_sum
                result["vwap"] = self._safe_float(vwap.iloc[-1])
            except Exception as exc:
                logger.warning(f"compute_all: VWAP failed: {exc}")

        return result

    def analyze_asset(
        self,
        symbol: str,
        current_price: float,
        prices_history: List[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Comprehensive asset analysis including technicals and risk metrics.

        Args:
            symbol: Asset symbol
            current_price: Current market price
            prices_history: List of dicts with {price, ts} keys

        Returns:
            Dict with technical indicators, risk metrics, Fibonacci levels, Z-score
        """
        logger.info(f"analyze_asset: symbol={symbol} price={current_price} history_len={len(prices_history or [])}")

        metrics = {
            "rsi_14": None,
            "macd": None,
            "atr_14": None,
            "atr_50": None,
            "bollinger": None,
            "sma_20": None,
            "sma_50": None,
            "sma_100": None,
            "sma_200": None,
            "ema_12": None,
            "ema_105": None,
            "vwap": None,
            "sharpe": 0.0,
            "sortino": 0.0,
            "max_drawdown": 0.0,
            "beta": 1.0,
            "ewma_vol": 0.0,
            "fib_618": None,
            "fib_382": None,
            "z_score": None,
            "volume_spike": False,
        }

        if not prices_history or len(prices_history) < 100:
            logger.warning(f"analyze_asset: insufficient data for {symbol}")
            return metrics

        try:
            df = pd.DataFrame(prices_history).set_index("ts").sort_index()
            if "price" not in df.columns:
                logger.error(f"analyze_asset: no 'price' column in history")
                return metrics

            df.rename(columns={"price": "close"}, inplace=True)
            df["open"] = df["close"]
            df["high"] = df["close"]
            df["low"] = df["close"]
            df["volume"] = 1.0  # Placeholder

            df = self._sanitize_timeseries(df)
            if df.empty or len(df) < 100:
                return metrics

            # Append indicators
            df.ta.rsi(length=14, append=True)
            df.ta.macd(fast=12, slow=26, signal=9, append=True)
            df.ta.atr(length=14, append=True)
            df.ta.atr(length=50, append=True)
            df.ta.bbands(length=20, std=2, append=True)
            df["SMA_20"] = df["close"].rolling(window=20).mean()
            df["SMA_50"] = df["close"].rolling(window=50).mean()
            df["SMA_100"] = df["close"].rolling(window=100).mean()
            df["SMA_200"] = df["close"].rolling(window=200).mean()
            df["EMA_12"] = df["close"].ewm(span=12, adjust=False).mean()
            df["EMA_105"] = df["close"].ewm(span=105, adjust=False).mean()

            # Fibonacci levels (120-day range)
            period_high = df["high"].tail(120).max()
            period_low = df["low"].tail(120).min()
            price_range = period_high - period_low
            if price_range > 0:
                metrics["fib_618"] = round(period_high - (0.618 * price_range), 2)
                metrics["fib_382"] = round(period_high - (0.382 * price_range), 2)

            # Z-Score (200-day)
            roll_std_200 = df["close"].rolling(window=200).std().iloc[-1]
            roll_mean_200 = df["close"].rolling(window=200).mean().iloc[-1]
            if roll_std_200 > 0:
                metrics["z_score"] = (current_price - roll_mean_200) / roll_std_200

            # Risk metrics from returns
            returns = df["close"].pct_change(fill_method=None).dropna()
            risk_data = self._calculate_risk_metrics(returns)
            metrics.update(risk_data)

            # Extract latest values
            latest = df.iloc[-1]
            metrics["rsi_14"] = self._safe_float(latest.get("RSI_14"))

            macd_val = self._safe_float(latest.get("MACD_12_26_9"))
            macd_sig = self._safe_float(latest.get("MACDs_12_26_9"))
            macd_hist = self._safe_float(latest.get("MACDh_12_26_9"))
            if macd_val is not None:
                metrics["macd"] = {
                    "value": macd_val,
                    "signal": macd_sig,
                    "histogram": macd_hist
                }

            metrics["atr_14"] = self._safe_float(latest.get("ATR_14"))
            metrics["atr_50"] = self._safe_float(latest.get("ATRr_50"))
            metrics["sma_20"] = self._safe_float(latest.get("SMA_20"))
            metrics["sma_50"] = self._safe_float(latest.get("SMA_50"))
            metrics["sma_100"] = self._safe_float(latest.get("SMA_100"))
            metrics["sma_200"] = self._safe_float(latest.get("SMA_200"))
            metrics["ema_12"] = self._safe_float(latest.get("EMA_12"))
            metrics["ema_105"] = self._safe_float(latest.get("EMA_105"))

            # Volume spike
            vol_sma20 = df["volume"].rolling(window=20).mean().iloc[-1]
            metrics["volume_spike"] = (latest.get("volume", 1.0) > 1.5 * vol_sma20)

            logger.info(f"analyze_asset: {symbol} RSI={metrics['rsi_14']} Sharpe={metrics['sharpe']:.2f}")
            return metrics

        except Exception as exc:
            logger.exception(f"analyze_asset failed for {symbol}: {exc}")
            return metrics
