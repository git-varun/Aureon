import yfinance as yf
import pandas as pd
import logging
import logging

import pandas as pd
import yfinance as yf


class QuantEngine:
    def __init__(self):
        self.logger = logging.getLogger("Quant")
        self._cache = {}

    def analyze_asset(self, symbol: str, current_price: float) -> dict:
        if symbol in self._cache: return self._cache[symbol]

        metrics = {"rsi": None, "atr": None, "macd": None, "macd_signal": None, "bb_upper": None, "bb_lower": None,
                   "tsl": None, "math_signal": "HOLD"}
        if symbol == "GOLD" or symbol.startswith("FD-"): return metrics

        try:
            df = yf.download(symbol, period="6mo", interval="1d", progress=False)
            if df.empty or len(df) < 50: return metrics

            # Handle yfinance multi-index update for 2026
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)

            # Calculate Advanced Indicators
            df.ta.rsi(length=14, append=True)
            df.ta.atr(length=14, append=True)
            df.ta.macd(fast=12, slow=26, signal=9, append=True)
            df.ta.bbands(length=20, std=2, append=True)

            latest = df.iloc[-1]
            rsi = float(latest.get('RSI_14', 50))
            atr = float(latest.get('ATRr_14', 0))

            # MACD Logic (Bullish if MACD line is above Signal line)
            macd_line = float(latest.get('MACD_12_26_9', 0))
            macd_sig = float(latest.get('MACDs_12_26_9', 0))

            # Bollinger Bands
            bb_up = float(latest.get('BBU_20_2.0', current_price * 1.05))
            bb_low = float(latest.get('BBL_20_2.0', current_price * 0.95))

            tsl = current_price - (2 * atr) if atr else (current_price * 0.95)

            # Triple-Math Signal Generation
            signal = "HOLD"
            if rsi < 30 and current_price <= bb_low:
                signal = "STRONG BUY (Oversold + BB Bounce)"
            elif rsi > 70 and current_price >= bb_up:
                signal = "TAKE PROFIT (Overbought + BB Resistance)"
            elif macd_line > macd_sig and rsi < 60:
                signal = "ACCUMULATE (MACD Bull Cross)"
            elif current_price < tsl:
                signal = "SELL (TSL HIT)"

            metrics.update({
                "rsi": round(rsi, 2), "atr": round(atr, 2), "tsl": round(tsl, 2),
                "macd": round(macd_line, 2), "macd_signal": round(macd_sig, 2),
                "bb_upper": round(bb_up, 2), "bb_lower": round(bb_low, 2),
                "math_signal": signal
            })

            self._cache[symbol] = metrics
            return metrics
        except Exception as e:
            return metrics