# storage/repositories/fundamentals_repo.py
from storage.db_postgres import get_db
from typing import List, Dict, Optional
from datetime import datetime, timedelta

class FundamentalsRepository:
    def create(self, asset_id: int, pe_ratio: float = None, eps: float = None,
               market_cap: float = None, high_52w: float = None, low_52w: float = None,
               health: str = None, ts: datetime = None):
        ts = ts or datetime.now()
        with get_db().transaction() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO fundamentals
                    (asset_id, pe_ratio, eps, market_cap, high_52w, low_52w, health, ts)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (asset_id, ts) DO UPDATE SET
                    pe_ratio = EXCLUDED.pe_ratio, eps = EXCLUDED.eps, market_cap = EXCLUDED.market_cap,
                    high_52w = EXCLUDED.high_52w, low_52w = EXCLUDED.low_52w, health = EXCLUDED.health
                """, (asset_id, pe_ratio, eps, market_cap, high_52w, low_52w, health, ts))

    def get_latest(self, asset_id: int) -> Optional[Dict]:
        return get_db().fetchone(
            "SELECT * FROM fundamentals WHERE asset_id = %s ORDER BY ts DESC LIMIT 1",
            (asset_id,)
        )

    def cleanup_old(self, days: int = 365):
        cutoff = datetime.now() - timedelta(days=days)
        with get_db().transaction() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM fundamentals WHERE ts < %s", (cutoff,))


# storage/repositories/technical_indicator_repo.py
from storage.db_postgres import get_db
from typing import List, Dict, Optional
from datetime import datetime, timedelta

class TechnicalIndicatorRepository:
  def create(self, asset_id: int, momentum_rsi: float = None, trend_strength: float = None,
             price_risk_pct: float = None, bb_upper: float = None, bb_lower: float = None,
             vwap: float = None, z_score: float = None, macro_tsl: float = None,
             target_1_2: float = None, tv_signal: str = None, bmsb_status: str = None, ts: datetime = None):
      ts = ts or datetime.now()
      with get_db().transaction() as conn:
          with conn.cursor() as cur:
              cur.execute("""
                  INSERT INTO technical_indicators
                  (asset_id, momentum_rsi, trend_strength, price_risk_pct, bb_upper, bb_lower, vwap, z_score, macro_tsl, target_1_2, tv_signal, bmsb_status, ts)
                  VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
              """, (asset_id, momentum_rsi, trend_strength, price_risk_pct, bb_upper, bb_lower, vwap, z_score, macro_tsl, target_1_2, tv_signal, bmsb_status, ts))

  def create_batch(self, records: List[Dict]):
      """Append multiple technical indicator points."""
      if not records:
          return
      with get_db().transaction() as conn:
          with conn.cursor() as cur:
              for r in records:
                  cur.execute("""
                      INSERT INTO technical_indicators
                      (asset_id, momentum_rsi, trend_strength, price_risk_pct, bb_upper,
bb_lower, vwap, z_score, macro_tsl, target_1_2, tv_signal, bmsb_status, ts)
                      VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                  """, (r['asset_id'], r.get('momentum_rsi'), r.get('trend_strength'), r.get('price_risk_pct'),
                        r.get('bb_upper'), r.get('bb_lower'), r.get('vwap'), r.get('z_score'), r.get('macro_tsl'),
                        r.get('target_1_2'), r.get('tv_signal'), r.get('bmsb_status'), r.get('ts', datetime.now())))

  def get_latest(self, asset_id: int) -> Optional[Dict]:
      return get_db().fetchone(
          "SELECT * FROM technical_indicators WHERE asset_id = %s ORDER BY ts DESC LIMIT 1",
          (asset_id,)
      )

  def get_range(self, asset_id: int, start: datetime, end: datetime) -> List[Dict]:
      return get_db().fetchall(
          "SELECT * FROM technical_indicators WHERE asset_id = %s AND ts BETWEEN %s AND %s ORDER BY ts ASC",
          (asset_id, start, end)
      )

  def get_last_n_days(self, asset_id: int, days: int = 30) -> List[Dict]:
      start = datetime.now() - timedelta(days=days)
      return self.get_range(asset_id, start, datetime.now())

  def get_by_signal(self, asset_id: int, signal: str) -> Optional[Dict]:
      return get_db().fetchone(
          "SELECT * FROM technical_indicators WHERE asset_id = %s AND tv_signal = %s ORDER BY ts DESC LIMIT 1",
          (asset_id, signal)
      )

  def cleanup_old(self, days: int = 365):
      cutoff = datetime.now() - timedelta(days=days)
      with get_db().transaction() as conn:
          with conn.cursor() as cur:
              cur.execute("DELETE FROM technical_indicators WHERE ts < %s", (cutoff))



