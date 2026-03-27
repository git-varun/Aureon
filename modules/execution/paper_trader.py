import datetime
import logging
import os
import sqlite3


class PaperTrader:
    """Simulates trades based on AI Directives to track Algorithmic P&L."""

    def __init__(self, db_path="data/paper_trades.db"):
        self.logger = logging.getLogger("PaperTrader")
        self.db_path = db_path
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            # Create a ledger to track all virtual trades
            conn.execute('''
                         CREATE TABLE IF NOT EXISTS trade_ledger
                         (
                             id
                             INTEGER
                             PRIMARY
                             KEY
                             AUTOINCREMENT,
                             date
                             TEXT,
                             symbol
                             TEXT,
                             action
                             TEXT,
                             qty
                             REAL,
                             execution_price
                             REAL,
                             total_value
                             REAL,
                             reasoning
                             TEXT,
                             status
                             TEXT
                             DEFAULT
                             'OPEN'
                         )
                         ''')

    def execute_directive(self, symbol: str, action: str, current_price: float, reasoning: str):
        """Executes a virtual trade if the AI issues a strict BUY or SELL."""
        if not current_price or current_price <= 0:
            return

        action = action.upper()
        date_now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Standardize a virtual trade size (e.g., allocating ₹10,000 per trade)
        virtual_allocation = 10000.0
        qty = virtual_allocation / current_price

        with sqlite3.connect(self.db_path) as conn:
            if "BUY" in action or "AVG DOWN" in action:
                conn.execute(
                    "INSERT INTO trade_ledger (date, symbol, action, qty, execution_price, total_value, reasoning) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (date_now, symbol, "BUY", qty, current_price, virtual_allocation, reasoning)
                )
                self.logger.info(f"📝 PAPER TRADE: BOUGHT {qty:.4f} {symbol} @ ₹{current_price:,.2f}")

            elif "SELL" in action or "TAKE PROFIT" in action:
                # Find if we have open positions to close
                open_pos = conn.execute(
                    "SELECT id, execution_price FROM trade_ledger WHERE symbol=? AND action='BUY' AND status='OPEN'",
                    (symbol,)).fetchone()

                if open_pos:
                    trade_id, entry_price = open_pos
                    profit_pct = ((current_price - entry_price) / entry_price) * 100

                    # Close the trade
                    conn.execute("UPDATE trade_ledger SET status='CLOSED' WHERE id=?", (trade_id,))

                    # Log the Sell
                    conn.execute(
                        "INSERT INTO trade_ledger (date, symbol, action, qty, execution_price, total_value, reasoning, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        (date_now, symbol, "SELL", qty, current_price, virtual_allocation, reasoning,
                         f"CLOSED ({profit_pct:+.2f}%)")
                    )
                    self.logger.info(f"📝 PAPER TRADE: SOLD {symbol} @ ₹{current_price:,.2f} | PnL: {profit_pct:+.2f}%")

    def get_trade_history(self) -> list:
        """Fetches the ledger for the Streamlit Dashboard."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute("SELECT * FROM trade_ledger ORDER BY id DESC").fetchall()
            return [dict(row) for row in rows]
