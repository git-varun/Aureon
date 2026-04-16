"""Signals repositories."""
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
from app.modules.signals.models import Signal


class SignalRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, asset_id: int, action: str, confidence: float, reason: str = None, source: str = None, ts: datetime = None) -> Signal:
        signal = Signal(
            asset_id=asset_id,
            action=action,
            confidence=confidence,
            reason=reason,
            source=source,
            timestamp=ts or datetime.now()
        )
        self.db.add(signal)
        self.db.commit()
        self.db.refresh(signal)
        return signal

    def create_batch(self, records: List[Dict]) -> List[Signal]:
        signals = []
        for r in records:
            signal = Signal(
                asset_id=r['asset_id'],
                action=r['action'],
                confidence=r['confidence'],
                reason=r.get('reason'),
                source=r.get('source'),
                timestamp=r.get('ts', datetime.now())
            )
            signals.append(signal)
        self.db.add_all(signals)
        self.db.commit()
        return signals

    def get_latest(self, asset_id: int, limit: int = 1) -> List[Signal]:
        return self.db.query(Signal).filter(Signal.asset_id == asset_id).order_by(Signal.timestamp.desc()).limit(limit).all()

    def get_by_action(self, asset_id: int, action: str) -> List[Signal]:
        return self.db.query(Signal).filter(Signal.asset_id == asset_id, Signal.action == action).order_by(Signal.timestamp.desc()).all()

    def get_by_source(self, source: str, limit: int = 100) -> List[Signal]:
        return self.db.query(Signal).filter(Signal.source == source).order_by(Signal.timestamp.desc()).limit(limit).all()

    def get_range(self, asset_id: int, start: datetime, end: datetime) -> List[Signal]:
        return self.db.query(Signal).filter(Signal.asset_id == asset_id, Signal.timestamp.between(start, end)).order_by(Signal.timestamp).all()

    def get_last_n_days(self, asset_id: int, days: int = 7) -> List[Signal]:
        start = datetime.now() - timedelta(days=days)
        return self.get_range(asset_id, start, datetime.now())

    def get_high_confidence(self, asset_id: int, threshold: float = 80.0) -> List[Signal]:
        return self.db.query(Signal).filter(Signal.asset_id == asset_id, Signal.confidence >= threshold).order_by(Signal.confidence.desc(), Signal.timestamp.desc()).all()

    def get_all_latest(self, limit: int = 1) -> List[Signal]:
        # This is more complex in SQLAlchemy, but for simplicity
        subquery = self.db.query(Signal.asset_id, Signal.timestamp).distinct(Signal.asset_id).order_by(Signal.asset_id, Signal.timestamp.desc()).subquery()
        return self.db.query(Signal).join(subquery, (Signal.asset_id == subquery.c.asset_id) & (Signal.timestamp == subquery.c.timestamp)).limit(limit).all()

    def get_action_summary(self, asset_id: int, days: int = 7) -> Dict[str, int]:
        start = datetime.now() - timedelta(days=days)
        from sqlalchemy import func
        results = self.db.query(Signal.action, func.count(Signal.id)).filter(Signal.asset_id == asset_id, Signal.timestamp >= start).group_by(Signal.action).all()
        return {action: count for action, count in results}

    def get_consensus(self, asset_id: int, limit: int = 5) -> Optional[str]:
        from sqlalchemy import func
        result = self.db.query(Signal.action, func.count(Signal.id).label('count')).filter(Signal.asset_id == asset_id).order_by(Signal.timestamp.desc()).limit(limit).group_by(Signal.action).order_by(func.count(Signal.id).desc()).first()
        return result.action if result else None

    def cleanup_old(self, days: int = 365) -> None:
        cutoff = datetime.now() - timedelta(days=days)
        self.db.query(Signal).filter(Signal.timestamp < cutoff).delete()
        self.db.commit()
