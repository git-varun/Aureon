import datetime
import logging
import os
import sqlite3

import yfinance as yf


class MemoryEngine:
    """Logs market news and calculates historical T+3 Day impact for AI context."""

    def __init__(self, db_path=None):
        self.logger = logging.getLogger(__name__)

        if db_path is None:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            db_path = os.path.join(base_dir, "..", "..", "data", "market_memory.db")

        self.db_path = os.path.abspath(db_path)
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)

        # Verify the directory is actually writable before attempting DB creation
        db_dir = os.path.dirname(self.db_path)
        if not os.access(db_dir, os.W_OK):
            raise PermissionError(
                f"MemoryEngine cannot write to DB directory: {db_dir}\n"
                f"Try: sudo chown -R $USER:$USER {db_dir}"
            )

        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('''
                         CREATE TABLE IF NOT EXISTS market_memory
                         (
                             id
                             INTEGER
                             PRIMARY
                             KEY
                             AUTOINCREMENT,
                             symbol
                             TEXT,
                             date_logged
                             DATE,
                             headline
                             TEXT,
                             start_price
                             REAL,
                             end_price
                             REAL,
                             impact_pct
                             REAL,
                             resolved
                             INTEGER
                             DEFAULT
                             0
                         )
                         ''')
            conn.execute("CREATE INDEX IF NOT EXISTS idx_sym ON market_memory(symbol)")

    def log_today_news(self, symbol: str, headline: str, current_price: float):
        """Saves today's news to evaluate later. Skips if already logged today."""
        if not headline or current_price == 0:
            return
        today = datetime.date.today().isoformat()

        with sqlite3.connect(self.db_path) as conn:
            existing = conn.execute(
                "SELECT id FROM market_memory WHERE symbol=? AND date_logged=?",
                (symbol, today)
            ).fetchone()

            if not existing:
                conn.execute(
                    "INSERT INTO market_memory (symbol, date_logged, headline, start_price) VALUES (?, ?, ?, ?)",
                    (symbol, today, headline, current_price)
                )

    def consolidate_memories(self):
        """Runs once a day. Checks news from 3+ days ago and calculates the actual price impact."""
        import pandas as pd  # Ensure pandas is imported for type checking

        target_date = (datetime.date.today() - datetime.timedelta(days=3)).isoformat()

        with sqlite3.connect(self.db_path) as conn:
            unresolved = conn.execute(
                "SELECT id, symbol, start_price, date_logged FROM market_memory WHERE resolved=0 AND date_logged <= ?",
                (target_date,)
            ).fetchall()

            for row in unresolved:
                mem_id, symbol, start_price, date_logged = row

                # 1. Skip manual/offline assets that Yahoo Finance doesn't track
                if symbol == "GOLD" or symbol.startswith("FD-"):
                    conn.execute("UPDATE market_memory SET resolved=1 WHERE id=?", (mem_id,))
                    continue

                try:
                    # 2. Add a 4-day buffer to gracefully skip weekends/holidays
                    start_dt = datetime.datetime.strptime(date_logged, "%Y-%m-%d") + datetime.timedelta(days=3)
                    end_dt = start_dt + datetime.timedelta(days=4)

                    df = yf.download(
                        symbol,
                        start=start_dt.strftime("%Y-%m-%d"),
                        end=end_dt.strftime("%Y-%m-%d"),
                        progress=False,
                        show_errors=False  # Silences the "possibly delisted" terminal spam
                    )

                    if not df.empty:
                        # Handle yfinance multi-index update
                        if hasattr(df.columns, 'levels') or isinstance(df.columns, pd.MultiIndex):
                            close_price = float(df['Close'].iloc[0].iloc[0])
                        else:
                            close_price = float(df['Close'].iloc[0])

                        impact = ((close_price - start_price) / start_price) * 100

                        conn.execute(
                            "UPDATE market_memory SET end_price=?, impact_pct=?, resolved=1 WHERE id=?",
                            (close_price, impact, mem_id)
                        )
                except Exception as e:
                    self.logger.debug(f"Could not resolve memory for {symbol}: {e}")

    def recall_history(self, symbol: str) -> str:
        """Fetches the top 3 most extreme historical price reactions for this asset."""
        with sqlite3.connect(self.db_path) as conn:
            memories = conn.execute('''
                                    SELECT headline, impact_pct
                                    FROM market_memory
                                    WHERE symbol = ?
                                      AND resolved = 1
                                      AND ABS(impact_pct) > 3.0
                                    ORDER BY ABS(impact_pct) DESC LIMIT 3
                                    ''', (symbol,)).fetchall()

        if not memories:
            return ""

        history_str = " | ".join([f"[{m[1]:+.1f}% Impact] {m[0]}" for m in memories])
        return f"Historical Context: {history_str}"
