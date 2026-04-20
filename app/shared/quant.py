"""Unified quantitative analysis engine: technical indicators, risk metrics, signal scoring.

This consolidated engine provides:
- Basic technical indicators: RSI, MACD, ATR, Bollinger Bands, SMAs, EMAs, VWAP
- Advanced risk metrics: Sharpe ratio, Sortino ratio, max drawdown, beta, EWMA volatility
- Signal scoring: BMSB status, trailing stop-loss, 1:2 risk/reward calculations
- Fibonacci levels, Z-score exhaustion, volume analysis
- Smart caching for performance (0.5% price bucket granularity)
- Works with both ORM objects and raw price dictionaries

Used by: signals, portfolio, analytics modules.
Safe graceful degradation for insufficient data (returns None/defaults).
"""

import logging
from typing import Optional, List, Dict, Any
import numpy as np
import pandas as pd
import pandas_ta  # noqa: F401 — registers the .ta accessor on pd.DataFrame

from app.core.config import settings
from app.core.context_cache import TTL_QUANT_MATH, smart_cache

logger = logging.getLogger("QuantEngine")


class QuantEngine:
    """Compute technical indicators and risk metrics from price data.

    Consolidated implementation combining:
    - Basic technical analysis (RSI, MACD, ATR, Bollinger, moving averages)
    - Advanced risk metrics (Sharpe, Sortino, max drawdown, beta, EWMA vol)
    - Signal scoring (BMSB status, TSL, 1:2 R/R, buy/sell signals)
    - Smart caching for performance

    All methods return None/defaults for unavailable indicators (graceful degradation).
    """

    def __init__(self, risk_free_rate: Optional[float] = None):
        """Initialize QuantEngine with optional risk-free rate.

        Args:
            risk_free_rate: Annual risk-free rate. If None, reads from settings.RISK_FREE_RATE
                           (default from settings: 0.06; fallback: 0.05)
        """
        if risk_free_rate is None:
            risk_free_rate = getattr(settings, 'RISK_FREE_RATE', 0.05)
        self.risk_free_rate = risk_free_rate
        logger.debug(f"QuantEngine initialized with risk_free_rate={self.risk_free_rate}")

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
            return f
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
            logger.debug("_calculate_risk_metrics: empty or zero-std returns — returning zero metrics")
            return metrics

        try:
            daily_rf = self.risk_free_rate / 252
            excess_returns = returns - daily_rf
            logger.debug("_calculate_risk_metrics: n=%d daily_rf=%.6f excess_mean=%.6f",
                         len(returns), daily_rf, excess_returns.mean())

            # Sharpe Ratio
            metrics["sharpe"] = np.sqrt(252) * (excess_returns.mean() / returns.std())

            # Sortino Ratio
            downside_returns = returns[returns < 0]
            downside_std = downside_returns.std()
            metrics["sortino"] = (
                np.sqrt(252) * (excess_returns.mean() / downside_std)
                if downside_std > 0 else 0.0
            )
            logger.debug("_calculate_risk_metrics: sharpe=%.3f sortino=%.3f downside_n=%d",
                         metrics["sharpe"], metrics["sortino"], len(downside_returns))

            # Max Drawdown
            cumulative_returns = (1 + returns).cumprod()
            rolling_max = cumulative_returns.cummax()
            drawdown = (cumulative_returns - rolling_max) / rolling_max
            metrics["max_drawdown"] = drawdown.min() * 100
            logger.debug("_calculate_risk_metrics: max_drawdown=%.2f%%", metrics["max_drawdown"])

            # EWMA Volatility (20-day, annualized)
            metrics["ewma_vol"] = returns.ewm(span=20).std().iloc[-1] * np.sqrt(252) * 100
            logger.debug("_calculate_risk_metrics: ewma_vol_annualised=%.2f%%", metrics["ewma_vol"])

            # Beta (vs benchmark if provided)
            if benchmark_returns is not None and not benchmark_returns.empty:
                cov = returns.cov(benchmark_returns)
                var = benchmark_returns.var()
                metrics["beta"] = (cov / var) if var > 0 else 1.0
                logger.debug("_calculate_risk_metrics: beta=%.3f (cov=%.6f var=%.6f)",
                             metrics["beta"], cov, var)
            else:
                logger.debug("_calculate_risk_metrics: no benchmark — beta=1.0 (default)")

            # Clean up NaN/Inf
            cleaned = {k: (round(v, 3) if not np.isnan(v) and not np.isinf(v) else 0.0)
                       for k, v in metrics.items()}
            logger.debug("_calculate_risk_metrics: result=%s", cleaned)
            return cleaned
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

        n_prices = len(prices) if prices else 0
        if not prices or n_prices < 14:
            logger.debug(f"compute_all: insufficient data ({n_prices} < 14)")
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
            total_portfolio_value: float = 100000,
        prices_history: List[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Comprehensive asset analysis: technicals + risk metrics + signal scoring.

        Includes:
        - Technical indicators (RSI, MACD, ATR, Bollinger, moving averages)
        - Risk metrics (Sharpe, Sortino, max drawdown, beta, EWMA vol)
        - Signal scoring (BMSB status, TSL, 1:2 R/R, BUY/SELL signals)
        - Smart cache (0.5% price bucket granularity)

        Args:
            symbol: Asset symbol
            current_price: Current market price
            total_portfolio_value: Portfolio size for position sizing (default: 100000)
            prices_history: List of dicts with {price, ts} keys

        Returns:
            Dict with all metrics, signals, and scoring (cached intelligently)
        """
        logger.info(
            f"analyze_asset: symbol={symbol} price={current_price:.4f} portfolio_value={total_portfolio_value:.2f} history={len(prices_history or [])}")

        # Cache key uses 0.5% price bucket to avoid per-second recomputation
        price_bucket = round(current_price * 200) / 200 if current_price else 0
        cache_key = f"quant_{symbol}_{price_bucket}"
        cached = smart_cache.get(cache_key)
        if cached is not None:
            logger.debug(f"analyze_asset: symbol={symbol} cache HIT key={cache_key}")
            return cached
        logger.debug(f"analyze_asset: symbol={symbol} cache MISS — computing full analysis")

        metrics = {
            "momentum_rsi": None,
            "trend_strength": None,
            "price_risk_pct": None,
            "z_score": None,
            "sharpe_ratio": None,
            "sortino_ratio": None,
            "beta": None,
            "macro_tsl": None,
            "target_1_2": None,
            "suggested_position": None,
            "bmsb_status": "UNKNOWN",
            "tv_signal": "HOLD",
            "bb_upper": None,
            "bb_lower": None,
            "fib_618": None,
            "fib_382": None,
            "vwap_volume_profile": None,
            "volume_spike": False,
            "technical_score": 50,
        }

        is_crypto = "-USD" in symbol
        logger.debug(f"analyze_asset: symbol={symbol} is_crypto={is_crypto}")

        # Skip certain asset types
        if symbol == "GOLD" or symbol.startswith("FD-") or "_MF" in symbol:
            logger.debug(f"analyze_asset: symbol={symbol} skipped (GOLD/FD/MF) — returning empty metrics")
            return metrics

        macro_stop_atr_multiplier = getattr(settings, 'MACRO_STOP_ATR_MULTIPLIER', 3.5)

        try:
            prices = prices_history or []
            if not prices or len(prices) < 100:
                logger.warning(
                    f"analyze_asset: symbol={symbol} insufficient price history ({len(prices)} < 100) — skipping")
                return metrics

            # Convert price records to DataFrame
            df_data = []
            for p in prices:
                df_data.append({
                    'Close': p.get('price'),
                    'ts': p.get('ts')
                })
            df = pd.DataFrame(df_data).set_index('ts').sort_index()

            # Simplified OHLC (use close for all since OHLC not stored per-record)
            df['Open'] = df['Close']
            df['High'] = df['Close']
            df['Low'] = df['Close']
            df['Volume'] = 1.0  # Placeholder

            df = self._sanitize_timeseries(df)
            if df.empty or len(df) < 100:
                return metrics

            bench_series = None  # Benchmark data not available

            # ── RISK MODELING ─────────────────────────────────────────────────────
            returns = df['Close'].pct_change(fill_method=None).dropna()
            bench_returns = bench_series.pct_change(fill_method=None).dropna() if bench_series is not None else None
            risk_data = self._calculate_risk_metrics(returns, bench_returns)

            # ── TECHNICAL INDICATORS ──────────────────────────────────────────────
            df.ta.rsi(length=14, append=True)
            df.ta.macd(fast=12, slow=26, signal=9, append=True)
            df.ta.atr(length=50, append=True)  # Wide ATR for macro swing
            df.ta.bbands(length=20, std=2, append=True)  # Bollinger Bands (20-day, 2σ)

            # Moving Averages
            df['SMA_50'] = df['Close'].rolling(window=50).mean()
            df['SMA_100'] = df['Close'].rolling(window=100).mean()
            df['EMA_105'] = df['Close'].ewm(span=105, adjust=False).mean()
            df['SMA_200'] = df['Close'].rolling(window=200).mean()

            # 20-day VWAP (institutional volume-weighted average price)
            vol_sum = df['Volume'].rolling(window=20).sum().replace(0, np.nan)
            df['VWAP'] = (df['Close'] * df['Volume']).rolling(window=20).sum() / vol_sum

            # Volume spike: current vs 20-day average
            df['vol_sma20'] = df['Volume'].rolling(window=20).mean()

            # ── FIBONACCI LEVELS (120-day range) ──────────────────────────────────
            period_high = df['High'].tail(120).max()
            period_low = df['Low'].tail(120).min()
            price_range = period_high - period_low
            fib_618 = round(period_high - (0.618 * price_range), 2) if price_range > 0 else None
            fib_382 = round(period_high - (0.382 * price_range), 2) if price_range > 0 else None

            # Z-Score Exhaustion (200-day)
            roll_std_200 = df['Close'].rolling(window=200).std().iloc[-1]

            latest = df.iloc[-1]

            # Extract indicators
            rsi = self._safe_float(latest.get('RSI_14'), 50)
            atr_50 = self._safe_float(latest.get('ATRr_50'), 0)
            macd_hist = self._safe_float(latest.get('MACDh_12_26_9'), 0)
            sma_50 = self._safe_float(latest.get('SMA_50'), current_price)
            sma_100 = self._safe_float(latest.get('SMA_100'), current_price)
            ema_105 = self._safe_float(latest.get('EMA_105'), current_price)
            sma_200 = self._safe_float(latest.get('SMA_200'), current_price)
            vwap = self._safe_float(latest.get('VWAP'), current_price)

            # Bollinger Bands — resolve dynamic column names
            bbu_col = [c for c in df.columns if c.startswith('BBU_')]
            bbl_col = [c for c in df.columns if c.startswith('BBL_')]
            bb_upper = round(self._safe_float(latest[bbu_col[0]], current_price * 1.05), 2) if bbu_col else None
            bb_lower = round(self._safe_float(latest[bbl_col[0]], current_price * 0.95), 2) if bbl_col else None

            # Volume spike detection
            vol_avg = self._safe_float(latest.get('vol_sma20'), 1) or 1
            current_vol = self._safe_float(latest.get('Volume'), 0)
            volume_spike = (current_vol / vol_avg) > 2.0 if vol_avg > 0 else False

            z_score_200 = (current_price - sma_200) / roll_std_200 if roll_std_200 > 0 else 0

            # ── 1:2 RISK/REWARD ARCHITECT ───────────────────────────────────────
            macro_tsl = current_price - (macro_stop_atr_multiplier * atr_50)
            risk_per_share = current_price - macro_tsl
            target_1_2 = current_price + (2 * risk_per_share)

            max_risk_amount = total_portfolio_value * 0.02
            suggested_shares = max_risk_amount / risk_per_share if risk_per_share > 0 else 0
            suggested_allocation = suggested_shares * current_price

            # ── BMSB STATUS ──────────────────────────────────────────────────────
            above_bmsb = current_price > sma_100 and current_price > ema_105
            bmsb_status = "ABOVE BAND (HOLD)" if above_bmsb else "BELOW BAND (RISK OFF)"

            above_200 = current_price > sma_200
            above_50 = current_price > sma_50

            # ── MULTI-CONDITION SIGNAL SCORING ──────────────────────────────────
            bullish = 0
            bearish = 0

            # RSI extremes carry heavy weight
            if rsi < 30:
                bullish += 3
            elif rsi < 40:
                bullish += 2
            elif rsi < 50:
                bullish += 1
            elif rsi > 75:
                bearish += 3
            elif rsi > 65:
                bearish += 2
            elif rsi > 55:
                bearish += 1

            # Trend filters
            if above_200:
                bullish += 2
            else:
                bearish += 2

            if above_bmsb:
                bullish += 2
            else:
                bearish += 1

            if above_50:
                bullish += 1
            else:
                bearish += 1

            # Momentum (MACD)
            if macd_hist > 0:
                bullish += 1
            else:
                bearish += 1

            # Z-Score exhaustion
            if z_score_200 > 3.5:
                bearish += 3
            elif z_score_200 > 2.5:
                bearish += 2
            elif z_score_200 > 2.0:
                bearish += 1
            elif z_score_200 < -2.0:
                bullish += 1

            # Volume confirmation
            if volume_spike and macd_hist > 0:
                bullish += 1
            if volume_spike and macd_hist < 0:
                bearish += 1

            net_score = bullish - bearish
            logger.debug(
                "analyze_asset: symbol=%s scoring — bullish=%d bearish=%d net=%d "
                "above200=%s above_bmsb=%s above50=%s rsi=%.1f macd_hist=%.4f z_score=%.2f vol_spike=%s",
                symbol, bullish, bearish, net_score,
                above_200, above_bmsb, above_50, rsi, macd_hist, z_score_200, volume_spike
            )

            # Signal determination — strict actionable categories
            if net_score >= 6:
                tv_signal = "STRONG BUY"
            elif net_score >= 3:
                tv_signal = "BUY"
            elif net_score >= 1 and not above_200:
                tv_signal = "AVERAGE DOWN"
            elif net_score >= 0:
                tv_signal = "HOLD"
            elif net_score <= -3 and z_score_200 > 2.0:
                tv_signal = "PARTIAL SELL"
            elif net_score <= -4:
                tv_signal = "SELL"
            else:
                tv_signal = "HOLD"

            # Technical composite score (0-100)
            technical_score = max(0, min(100, 50 + (net_score * 7)))
            logger.info(
                "analyze_asset: symbol=%s → signal=%s score=%d rsi=%.1f z=%.2f "
                "tsl=%.2f target=%.2f bmsb=%s",
                symbol, tv_signal, technical_score, rsi, z_score_200,
                macro_tsl, target_1_2, bmsb_status
            )

            metrics.update({
                "momentum_rsi": round(rsi, 2),
                "trend_strength": round(macd_hist, 4),
                "price_risk_pct": round((atr_50 / current_price) * 100, 2) if current_price else 0,
                "z_score": round(z_score_200, 2),
                "sharpe_ratio": risk_data['sharpe'],
                "sortino_ratio": risk_data['sortino'],
                "beta": risk_data['beta'],
                "macro_tsl": round(macro_tsl, 2),
                "target_1_2": round(target_1_2, 2),
                "suggested_position": f"{round(suggested_shares, 2)} Shares (₹{round(suggested_allocation, 0)})",
                "bmsb_status": bmsb_status,
                "tv_signal": tv_signal,
                "bb_upper": bb_upper,
                "bb_lower": bb_lower,
                "fib_618": fib_618,
                "fib_382": fib_382,
                "vwap_volume_profile": round(vwap, 4) if vwap else None,
                "volume_spike": bool(volume_spike),
                "technical_score": technical_score,
            })

            smart_cache.set(cache_key, metrics, expire=TTL_QUANT_MATH)
            return metrics
        except Exception as e:
            logger.error(f"Quant Math Error for {symbol}: {e}", exc_info=True)
            return metrics
