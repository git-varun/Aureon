import pandas as pd
import numpy as np
import pandas_ta as ta
import logging
from datetime import datetime, timedelta

from app.core.context_cache import smart_cache, TTL_QUANT_MATH
from config import config


class QuantEngine:
    """Calculates Advanced Technicals, Risk Metrics, and Volatility Models from passed price data."""
    def __init__(self):
        self.logger = logging.getLogger("QuantEngine")
        self.risk_free_rate = config.RISK_FREE_RATE

    def _sanitize_timeseries(self, df: pd.DataFrame) -> pd.DataFrame:
        """Removes Infs, fills NaNs safely, and forces float64."""
        df = df.replace([np.inf, -np.inf], np.nan)
        df = df.ffill().bfill()
        return df.astype(np.float64)

    def _calculate_risk_metrics(self, returns: pd.Series, benchmark_returns: pd.Series = None) -> dict:
        metrics = {"sharpe": 0.0, "sortino": 0.0, "max_drawdown": 0.0, "beta": 1.0, "ewma_vol": 0.0}
        if returns.empty or returns.std() == 0:
            self.logger.debug("_calculate_risk_metrics: empty or zero-std returns — returning zero metrics")
            return metrics

        daily_rf = self.risk_free_rate / 252
        excess_returns = returns - daily_rf
        self.logger.debug("_calculate_risk_metrics: n=%d daily_rf=%.6f excess_mean=%.6f",
                          len(returns), daily_rf, excess_returns.mean())

        metrics["sharpe"] = np.sqrt(252) * (excess_returns.mean() / returns.std())

        downside_returns = returns[returns < 0]
        downside_std = downside_returns.std()
        metrics["sortino"] = np.sqrt(252) * (excess_returns.mean() / downside_std) if downside_std > 0 else 0.0
        self.logger.debug("_calculate_risk_metrics: sharpe=%.3f sortino=%.3f downside_n=%d",
                          metrics["sharpe"], metrics["sortino"], len(downside_returns))

        cumulative_returns = (1 + returns).cumprod()
        rolling_max = cumulative_returns.cummax()
        drawdown = (cumulative_returns - rolling_max) / rolling_max
        metrics["max_drawdown"] = drawdown.min() * 100
        self.logger.debug("_calculate_risk_metrics: max_drawdown=%.2f%%", metrics["max_drawdown"])

        metrics["ewma_vol"] = returns.ewm(span=20).std().iloc[-1] * np.sqrt(252) * 100
        self.logger.debug("_calculate_risk_metrics: ewma_vol_annualised=%.2f%%", metrics["ewma_vol"])

        if benchmark_returns is not None and not benchmark_returns.empty:
            cov = returns.cov(benchmark_returns)
            var = benchmark_returns.var()
            metrics["beta"] = (cov / var) if var > 0 else 1.0
            self.logger.debug("_calculate_risk_metrics: beta=%.3f (cov=%.6f var=%.6f)", metrics["beta"], cov, var)
        else:
            self.logger.debug("_calculate_risk_metrics: no benchmark — beta=1.0 (default)")

        cleaned = {k: round(v, 3) if not np.isnan(v) and not np.isinf(v) else 0.0 for k, v in metrics.items()}
        self.logger.debug("_calculate_risk_metrics: result=%s", cleaned)
        return cleaned

    def _safe_float(self, val, default=None):
        """Safely convert a pandas value to float, returning default on failure."""
        try:
            f = float(val)
            if np.isnan(f) or np.isinf(f):
                return default
            return f
        except (TypeError, ValueError):
            return default

    def analyze_asset(self, symbol: str, current_price: float, total_portfolio_value: float = 100000, prices_history: list = None) -> dict:
        self.logger.info("analyze_asset: symbol=%s price=%.4f portfolio_value=%.2f history=%d",
                         symbol, current_price, total_portfolio_value,
                         len(prices_history) if prices_history else 0)

        # Cache key includes price bucket (rounded to 0.5%) so a significant price move
        # invalidates the quant snapshot while still avoiding per-second recomputes.
        price_bucket = round(current_price * 200) / 200 if current_price else 0
        cache_key = f"quant_{symbol}_{price_bucket}"
        cached = smart_cache.get(cache_key)
        if cached is not None:
            self.logger.debug("analyze_asset: symbol=%s cache HIT key=%s", symbol, cache_key)
            return cached
        self.logger.debug("analyze_asset: symbol=%s cache MISS — computing full quant analysis", symbol)

        metrics = {
            "momentum_rsi": None, "trend_strength": None, "price_risk_pct": None,
            "z_score": None, "sharpe_ratio": None, "sortino_ratio": None,
            "beta": None, "macro_tsl": None, "target_1_2": None,
            "suggested_position": None, "bmsb_status": "UNKNOWN", "tv_signal": "HOLD",
            # Analytics fields
            "bb_upper": None, "bb_lower": None,
            "fib_618": None, "fib_382": None,
            "vwap_volume_profile": None,
            "volume_spike": False,
            "technical_score": 50,
        }

        is_crypto = "-USD" in symbol
        self.logger.debug("analyze_asset: symbol=%s is_crypto=%s", symbol, is_crypto)

        if symbol == "GOLD" or symbol.startswith("FD-") or "_MF" in symbol:
            self.logger.debug("analyze_asset: symbol=%s skipped (GOLD/FD/MF) — returning empty metrics", symbol)
            return metrics

        try:
            prices = prices_history or []
            if not prices or len(prices) < 100:
                self.logger.warning("analyze_asset: symbol=%s insufficient price history (%d < 100) — skipping",
                                    symbol, len(prices))
                return metrics

            # Convert price records to DataFrame
            df_data = []
            for p in prices:
                df_data.append({
                    'Close': p.get('price'),
                    'ts': p.get('ts')
                })
            df = pd.DataFrame(df_data).set_index('ts').sort_index()

            # For now, simplified to close prices only (OHLCV not stored per-record)
            # Use close price as both open/high/low for technical calculation
            df['Open'] = df['Close']
            df['High'] = df['Close']
            df['Low'] = df['Close']
            df['Volume'] = 1.0  # Placeholder: not tracked in price_repo

            df = self._sanitize_timeseries(df)
            if df.empty or len(df) < 100:
                return metrics

            bench_series = None  # Benchmark data not used from DB (simplification)

            # Risk Modeling
            returns = df['Close'].pct_change(fill_method=None).dropna()
            bench_returns = bench_series.pct_change(fill_method=None).dropna() if bench_series is not None else None
            risk_data = self._calculate_risk_metrics(returns, bench_returns)

            # ── TECHNICAL INDICATORS ──────────────────────────────────────────────
            df.ta.rsi(length=14, append=True)
            df.ta.macd(fast=12, slow=26, signal=9, append=True)
            # Wide ATR for macro swing — smooths out short-term spikes
            df.ta.atr(length=50, append=True)
            # Bollinger Bands (20-day, 2σ) for structural levels
            df.ta.bbands(length=20, std=2, append=True)

            # Moving Averages
            df['SMA_50']  = df['Close'].rolling(window=50).mean()
            df['SMA_100'] = df['Close'].rolling(window=100).mean()
            df['EMA_105'] = df['Close'].ewm(span=105, adjust=False).mean()
            df['SMA_200'] = df['Close'].rolling(window=200).mean()

            # 20-day VWAP (institutional volume-weighted average price)
            vol_sum = df['Volume'].rolling(window=20).sum().replace(0, np.nan)
            df['VWAP'] = (df['Close'] * df['Volume']).rolling(window=20).sum() / vol_sum

            # Volume spike: current vs 20-day average
            df['vol_sma20'] = df['Volume'].rolling(window=20).mean()

            # ── FIBONACCI LEVELS (120-day range) ─────────────────────────────────
            period_high = df['High'].tail(120).max()
            period_low  = df['Low'].tail(120).min()
            price_range = period_high - period_low
            fib_618 = round(period_high - (0.618 * price_range), 2) if price_range > 0 else None
            fib_382 = round(period_high - (0.382 * price_range), 2) if price_range > 0 else None

            # Z-Score Exhaustion (200-Day)
            roll_std_200 = df['Close'].rolling(window=200).std().iloc[-1]

            latest = df.iloc[-1]

            rsi      = self._safe_float(latest.get('RSI_14'), 50)
            atr_50   = self._safe_float(latest.get('ATRr_50'), 0)
            macd_hist = self._safe_float(latest.get('MACDh_12_26_9'), 0)
            sma_50   = self._safe_float(latest.get('SMA_50'), current_price)
            sma_100  = self._safe_float(latest.get('SMA_100'), current_price)
            ema_105  = self._safe_float(latest.get('EMA_105'), current_price)
            sma_200  = self._safe_float(latest.get('SMA_200'), current_price)
            vwap     = self._safe_float(latest.get('VWAP'), current_price)

            # Bollinger Bands — resolve dynamic column names
            bbu_col = [c for c in df.columns if c.startswith('BBU_')]
            bbl_col = [c for c in df.columns if c.startswith('BBL_')]
            bb_upper = round(self._safe_float(latest[bbu_col[0]], current_price * 1.05), 2) if bbu_col else None
            bb_lower = round(self._safe_float(latest[bbl_col[0]], current_price * 0.95), 2) if bbl_col else None

            # Volume spike detection
            vol_avg     = self._safe_float(latest.get('vol_sma20'), 1) or 1
            current_vol = self._safe_float(latest.get('Volume'), 0)
            volume_spike = (current_vol / vol_avg) > 2.0 if vol_avg > 0 else False

            z_score_200 = (current_price - sma_200) / roll_std_200 if roll_std_200 > 0 else 0

            # ── 1:2 R/R ARCHITECT MATH ───────────────────────────────────────────
            macro_tsl      = current_price - (config.MACRO_STOP_ATR_MULTIPLIER * atr_50)
            risk_per_share = current_price - macro_tsl
            target_1_2     = current_price + (2 * risk_per_share)

            max_risk_amount    = total_portfolio_value * 0.02
            suggested_shares   = max_risk_amount / risk_per_share if risk_per_share > 0 else 0
            suggested_allocation = suggested_shares * current_price

            # ── BMSB STATUS ───────────────────────────────────────────────────────
            above_bmsb = current_price > sma_100 and current_price > ema_105
            bmsb_status = "ABOVE BAND (HOLD)" if above_bmsb else "BELOW BAND (RISK OFF)"

            above_200 = current_price > sma_200
            above_50  = current_price > sma_50

            # ── MULTI-CONDITION SIGNAL SCORING ────────────────────────────────────
            bullish = 0
            bearish = 0

            # RSI extremes carry heavy weight
            if   rsi < 30: bullish += 3
            elif rsi < 40: bullish += 2
            elif rsi < 50: bullish += 1
            elif rsi > 75: bearish += 3
            elif rsi > 65: bearish += 2
            elif rsi > 55: bearish += 1

            # Trend filters
            if above_200:  bullish += 2
            else:          bearish += 2

            if above_bmsb: bullish += 2
            else:          bearish += 1

            if above_50:   bullish += 1
            else:          bearish += 1

            # Momentum (MACD)
            if macd_hist > 0: bullish += 1
            else:             bearish += 1

            # Z-Score exhaustion
            if   z_score_200 > 3.5: bearish += 3
            elif z_score_200 > 2.5: bearish += 2
            elif z_score_200 > 2.0: bearish += 1
            elif z_score_200 < -2.0: bullish += 1

            # Volume confirmation
            if volume_spike and macd_hist > 0: bullish += 1
            if volume_spike and macd_hist < 0: bearish += 1

            net_score = bullish - bearish
            self.logger.debug(
                "analyze_asset: symbol=%s scoring — bullish=%d bearish=%d net=%d "
                "above200=%s above_bmsb=%s above50=%s rsi=%.1f macd_hist=%.4f z_score=%.2f vol_spike=%s",
                symbol, bullish, bearish, net_score,
                above_200, above_bmsb, above_50, rsi, macd_hist, z_score_200, volume_spike
            )

            # Signal determination — strict actionable categories
            if   net_score >= 6:                              tv_signal = "STRONG BUY"
            elif net_score >= 3:                              tv_signal = "BUY"
            elif net_score >= 1 and not above_200:            tv_signal = "AVERAGE DOWN"
            elif net_score >= 0:                              tv_signal = "HOLD"
            elif net_score <= -3 and z_score_200 > 2.0:      tv_signal = "PARTIAL SELL"
            elif net_score <= -4:                             tv_signal = "SELL"
            else:                                             tv_signal = "HOLD"

            # Technical composite score (0-100)
            technical_score = max(0, min(100, 50 + (net_score * 7)))
            self.logger.info(
                "analyze_asset: symbol=%s → signal=%s score=%d rsi=%.1f z=%.2f "
                "tsl=%.2f target=%.2f bmsb=%s",
                symbol, tv_signal, technical_score, rsi, z_score_200,
                current_price - (config.MACRO_STOP_ATR_MULTIPLIER * atr_50),
                current_price + (2 * (current_price - (config.MACRO_STOP_ATR_MULTIPLIER * atr_50))),
                bmsb_status
            )

            metrics.update({
                "momentum_rsi":       round(rsi, 2),
                "trend_strength":     round(macd_hist, 4),
                "price_risk_pct":     round((atr_50 / current_price) * 100, 2) if current_price else 0,
                "z_score":            round(z_score_200, 2),
                "sharpe_ratio":       risk_data['sharpe'],
                "sortino_ratio":      risk_data['sortino'],
                "beta":               risk_data['beta'],
                "macro_tsl":          round(macro_tsl, 2),
                "target_1_2":         round(target_1_2, 2),
                "suggested_position": f"{round(suggested_shares, 2)} Shares (₹{round(suggested_allocation, 0)})",
                "bmsb_status":        bmsb_status,
                "tv_signal":          tv_signal,
                # Analytics structural fields
                "bb_upper":           bb_upper,
                "bb_lower":           bb_lower,
                "fib_618":            fib_618,
                "fib_382":            fib_382,
                "vwap_volume_profile": round(vwap, 4) if vwap else None,
                "volume_spike":       bool(volume_spike),
                "technical_score":    technical_score,
            })

            smart_cache.set(cache_key, metrics, expire=TTL_QUANT_MATH)
            return metrics
        except Exception as e:
            self.logger.error(f"Quant Math Error for {symbol}: {e}", exc_info=True)
            return metrics
