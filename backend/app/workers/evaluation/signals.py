import logging
import uuid
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.redis import cache_asset_signals
from app.domain.entities.market import LatestQuote

logger = logging.getLogger("workers.evaluation.signals")

def calculate_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    up = delta.clip(lower=0)
    down = -delta.clip(upper=0)
    
    ema_up = up.ewm(com=period - 1, adjust=False).mean()
    ema_down = down.ewm(com=period - 1, adjust=False).mean()
    
    rs = ema_up / ema_down
    rsi = 100 - (100 / (1 + rs))
    return rsi

def calculate_macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> tuple[pd.Series, pd.Series, pd.Series]:
    exp1 = series.ewm(span=fast, adjust=False).mean()
    exp2 = series.ewm(span=slow, adjust=False).mean()
    macd_line = exp1 - exp2
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    macd_hist = macd_line - signal_line
    return macd_line, signal_line, macd_hist

def compute_indicators(symbol: str) -> dict:
    # Set default values
    import hashlib
    h = int(hashlib.md5(symbol.encode()).hexdigest(), 16)
    rsi_val = 30.0 + (h % 50)
    volatility_val = 0.15 + (h % 10) / 100.0
    sentiment_val = 0.5 + ((h % 5) - 2) / 10.0
    action = "BUY" if rsi_val < 40 else "SELL" if rsi_val > 70 else "HOLD"
    trend = "Oversold" if rsi_val < 40 else "Overbought" if rsi_val > 70 else "Neutral"
    macd_val = 0.5
    macd_sig = 0.4
    source = "mock"
    news_ts = int(datetime.now(timezone.utc).timestamp()) - 300  # Default to 5 minutes ago

    try:
        import yfinance as yf
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="1mo")
        if not hist.empty and len(hist) >= 14:
            closes = hist["Close"]
            # 1. Calculate RSI
            rsi_series = calculate_rsi(closes)
            rsi_val = float(rsi_series.iloc[-1])
            if np.isnan(rsi_val):
                rsi_val = 50.0

            # 2. Calculate MACD
            macd_line, signal_line, macd_hist = calculate_macd(closes)
            macd_val = float(macd_line.iloc[-1])
            macd_sig = float(signal_line.iloc[-1])

            # 3. Calculate Volatility (Std of daily returns)
            returns = closes.pct_change().dropna()
            if not returns.empty:
                volatility_val = float(returns.std())
            
            action = "SELL" if rsi_val > 70 else "BUY" if rsi_val < 30 else "HOLD"
            trend = "Overbought" if rsi_val > 70 else "Oversold" if rsi_val < 30 else "Neutral"
            source = "yfinance"

            # 4. Calculate Sentiment from news
            news = ticker.news
            pos_words = {"buy", "bullish", "profit", "grow", "upgrade", "beat", "positive", "strong", "higher"}
            neg_words = {"sell", "bearish", "loss", "decline", "downgrade", "miss", "negative", "weak", "lower"}
            pos_count = 0
            neg_count = 0
            latest_news_ts = 0
            for item in news:
                title_lower = str(item.get("title", "")).lower()
                pos_count += sum(1 for w in pos_words if w in title_lower)
                neg_count += sum(1 for w in neg_words if w in title_lower)
                
                # yfinance news items often have providerPublishTime or publishTime
                ts = item.get("providerPublishTime") or item.get("publishTime") or item.get("published_at")
                if ts:
                    try:
                        latest_news_ts = max(latest_news_ts, int(ts))
                    except Exception:
                        pass
            
            if news and latest_news_ts > 0:
                news_ts = latest_news_ts
            elif news:
                news_ts = int(datetime.now(timezone.utc).timestamp())
                
            total = pos_count + neg_count
            if total > 0:
                sentiment_val = 0.5 + (0.1 * (pos_count - neg_count))
                sentiment_val = max(0.0, min(1.0, sentiment_val))
    except Exception as e:
        logger.warning(f"Failed to fetch real-time analytics for {symbol}: {e}. Using deterministic fallback.")

    return {
        "rsi": rsi_val,
        "macd": macd_val,
        "macd_signal": macd_sig,
        "volatility": volatility_val,
        "sentiment": sentiment_val,
        "action": action,
        "trend": trend,
        "source": source,
        "news_timestamp": news_ts
    }

def generate_signals(asset_id: uuid.UUID) -> None:
    logger.info(f"Generating signals for asset: {asset_id}")
    with SessionLocal() as session:
        quote = session.scalar(select(LatestQuote).filter_by(asset_id=asset_id))
        if not quote:
            logger.warning(f"LatestQuote not found for asset: {asset_id}")
            return
            
        symbol = quote.symbol
        signals_dict = compute_indicators(symbol)
        signals_dict["asset_id"] = str(asset_id)
        signals_dict["symbol"] = symbol
        signals_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        # Cache in Redis
        cache_asset_signals(str(asset_id), signals_dict)
        
        # Trigger scoring
        from app.workers.evaluation.scoring import generate_scores
        generate_scores(asset_id)
