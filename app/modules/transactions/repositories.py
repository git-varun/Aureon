# storage/repositories/transaction_repo.py
from storage.db_postgres import get_db
from typing import List, Dict
from datetime import date

class TransactionRepository:
  def create(self, asset_id: int, source: str, txn_type: str, qty: float, price: float, fees:
    float, txn_date: date):
          with get_db().transaction() as conn:
              with conn.cursor() as cur:
                  cur.execute("""INSERT INTO transactions (asset_id, source, txn_type, qty, price, fees, txn_date) VALUES (%s, %s, %s, %s, %s, %s, %s)""", (asset_id, source, txn_type, qty, price, fees, txn_date))

  def get_by_asset(self, asset_id: int) -> List[Dict]:
    return get_db().fetchall("SELECT * FROM transactions WHERE asset_id = %s ORDER BY txn_date DESC", (asset_id,))

  def get_by_date_range(self, start_date: date, end_date: date) -> List[Dict]:
    return get_db().fetchall("SELECT * FROM transactions WHERE txn_date BETWEEN %s AND %s ORDER BY txn_date DESC", (start_date, end_date))

  def delete(self, txn_id: int):
    with get_db().transaction() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM transactions WHERE id = %s", (txn_id,))