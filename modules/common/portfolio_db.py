import datetime
import logging
import os
import sqlite3


class PortfolioDB:
    """Caches broker assets and tracks historical daily price movements."""

    def __init__(self, db_path="data/portfolio.db"):
        self.logger = logging.getLogger("PortfolioDB")
        self.db_path = db_path
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('''CREATE TABLE IF NOT EXISTS assets
                            (
                                symbol
                                TEXT
                                PRIMARY
                                KEY,
                                qty
                                REAL,
                                source
                                TEXT,
                                type
                                TEXT,
                                last_price
                                REAL,
                                last_updated
                                TEXT
                            )''')
            # NEW: Historical Tracking Table
            conn.execute('''CREATE TABLE IF NOT EXISTS price_history
            (
                date
                TEXT,
                symbol
                TEXT,
                price
                REAL,
                PRIMARY
                KEY
                            (
                date,
                symbol
                            )
                )''')

    def save_assets(self, assets):
        consolidated = {}
        for a in assets:
            sym = a['symbol']
            if sym in consolidated:
                consolidated[sym]['qty'] += a['qty']
                if a['source'] not in consolidated[sym]['source']: consolidated[sym]['source'] += f" & {a['source']}"
            else:
                consolidated[sym] = a.copy()

        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM assets")
            for a in consolidated.values():
                conn.execute("INSERT INTO assets (symbol, qty, source, type) VALUES (?, ?, ?, ?)",
                             (a['symbol'], a['qty'], a['source'], a['type']))
        self.logger.info(f"💾 Saved {len(consolidated)} assets to DB.")

    def load_assets(self) -> list:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            return [dict(r) for r in conn.execute("SELECT * FROM assets").fetchall()]

    def update_price(self, symbol: str, price: float):
        now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        today = datetime.date.today().isoformat()
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("UPDATE assets SET last_price=?, last_updated=? WHERE symbol=?", (price, now, symbol))
            # NEW: Log daily historical price
            conn.execute("INSERT OR REPLACE INTO price_history (date, symbol, price) VALUES (?, ?, ?)",
                         (today, symbol, price))

    def get_historical_prices(self, symbol: str):
        with sqlite3.connect(self.db_path) as conn:
            return conn.execute("SELECT date, price FROM price_history WHERE symbol=? ORDER BY date ASC",
                                (symbol,)).fetchall()
