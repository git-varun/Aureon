"""Pipeline routes: trigger and monitor the investment data pipeline."""
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import get_session, require_auth
from app.modules.pipeline.orchestrator import PipelineOrchestrator

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])


@router.post("/run")
def run_full_pipeline(db: Session = Depends(get_session), _user=Depends(require_auth)):
    """Dispatch the full 6-step daily pipeline."""
    return PipelineOrchestrator().run_daily_pipeline(db)


@router.post("/prices")
def run_price_refresh(db: Session = Depends(get_session), _user=Depends(require_auth)):
    """Dispatch price refresh only."""
    return PipelineOrchestrator().run_price_refresh(db)


@router.post("/signals")
def run_signals(db: Session = Depends(get_session), _user=Depends(require_auth)):
    """Dispatch prices → technicals → signals pipeline."""
    return PipelineOrchestrator().run_signals_pipeline(db)


@router.get("/status")
def pipeline_status(db: Session = Depends(get_session), _user=Depends(require_auth)):
    """Return the most recent job log entry."""
    from app.modules.config.models import JobLog
    latest = db.query(JobLog).order_by(JobLog.started_at.desc()).first()
    if not latest:
        return {"status": "no_runs"}
    return {
        "job_name": latest.job_name,
        "status": latest.status.value,
        "task_id": latest.task_id,
        "started_at": latest.started_at.isoformat() if latest.started_at else None,
        "ended_at": latest.ended_at.isoformat() if latest.ended_at else None,
        "duration_ms": latest.duration_ms,
        "error_message": latest.error_message,
    }


@router.get("/history")
def pipeline_history(limit: int = 20, db: Session = Depends(get_session), _user=Depends(require_auth)):
    """Return last N job log entries."""
    from app.modules.config.models import JobLog
    logs = db.query(JobLog).order_by(JobLog.started_at.desc()).limit(limit).all()
    return [
        {
            "id": l.id,
            "job_name": l.job_name,
            "status": l.status.value,
            "task_id": l.task_id,
            "started_at": l.started_at.isoformat() if l.started_at else None,
            "ended_at": l.ended_at.isoformat() if l.ended_at else None,
            "duration_ms": l.duration_ms,
            "error_message": l.error_message,
        }
        for l in logs
    ]
