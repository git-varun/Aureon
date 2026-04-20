"""Config services: CRUD for providers, jobs, and job logs. Manages key encryption."""
import json
import logging
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy.orm import Session

from app.modules.config.models import JobConfig, JobLog, JobStatus, ProviderConfig

logger = logging.getLogger("config.service")

# ── Default seed data ────────────────────────────────────────────────────────

_DEFAULT_PROVIDERS = [
    {"provider_name": "zerodha",  "provider_type": "broker",       "key_names": '["api_key","access_token"]'},
    {"provider_name": "groww",    "provider_type": "broker",       "key_names": '["api_key","api_secret"]'},
    {"provider_name": "binance",  "provider_type": "broker",       "key_names": '["api_key","api_secret"]'},
    {"provider_name": "coinbase", "provider_type": "broker",       "key_names": '["api_key","api_secret","api_passphrase"]'},
    {"provider_name": "custom_equity", "provider_type": "broker",  "key_names": '["holdings_json"]'},
    {"provider_name": "gemini",   "provider_type": "ai",           "key_names": '["api_key"]'},
    {"provider_name": "telegram", "provider_type": "notification", "key_names": '["bot_token","chat_id"]'},
]

_DEFAULT_JOBS = [
    {"job_name": "sync_portfolio",  "cron_expression": "0 9 * * 1-5",     "enabled": True},
    {"job_name": "refresh_prices",  "cron_expression": "*/15 9-15 * * 1-5", "enabled": True},
    {"job_name": "fetch_news",      "cron_expression": "0 8 * * *",        "enabled": True},
    {"job_name": "daily_briefing",  "cron_expression": "0 7 * * *",        "enabled": True},
    {"job_name": "run_signals",     "cron_expression": "30 9 * * 1-5",     "enabled": False},
]

# ── Encryption helpers ────────────────────────────────────────────────────────

def _fernet():
    """Return a Fernet instance keyed from settings.secret_key."""
    import base64
    from cryptography.fernet import Fernet
    from app.core.config import settings
    raw = settings.secret_key.encode()
    key = base64.urlsafe_b64encode(raw.ljust(32)[:32])
    return Fernet(key)


def _encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def _decrypt(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except Exception:
        return ""


# ── ConfigService ─────────────────────────────────────────────────────────────

class ConfigService:
    def __init__(self, db: Session):
        self.db = db

    # ── Providers ──────────────────────────────────────────────────────────

    def get_all_providers(self) -> List[dict]:
        providers = self.db.query(ProviderConfig).all()
        logger.debug("get_all_providers: returned %d providers", len(providers))
        return [self._provider_to_dict(p) for p in providers]

    def get_provider(self, provider_name: str) -> Optional[ProviderConfig]:
        logger.debug("get_provider: provider_name=%s", provider_name)
        p = self.db.query(ProviderConfig).filter_by(provider_name=provider_name).first()
        if p:
            logger.debug("get_provider: %s found enabled=%s", provider_name, p.enabled)
        else:
            logger.debug("get_provider: %s not found", provider_name)
        return p

    def update_provider(self, provider_name: str, enabled: Optional[bool] = None) -> Optional[dict]:
        logger.info("update_provider: provider=%s enabled=%s", provider_name, enabled)
        p = self.get_provider(provider_name)
        if not p:
            logger.warning("update_provider: provider=%s not found", provider_name)
            return None
        if enabled is not None:
            old = p.enabled
            p.enabled = enabled
            logger.debug("update_provider: provider=%s enabled %s→%s", provider_name, old, enabled)
        self.db.commit()
        logger.info("update_provider: provider=%s updated", provider_name)
        return self._provider_to_dict(p)

    def set_provider_key(self, provider_name: str, key_name: str, value: str) -> bool:
        """Encrypt and store a single API key for a provider."""
        logger.info("set_provider_key: provider=%s key=%s value_len=%d",
                    provider_name, key_name, len(value) if value else 0)
        p = self.get_provider(provider_name)
        if not p:
            logger.warning("set_provider_key: provider=%s not found", provider_name)
            return False
        keys = json.loads(p.encrypted_keys or "{}")
        keys[key_name] = _encrypt(value) if value else ""
        p.encrypted_keys = json.dumps(keys)
        self.db.commit()
        logger.info("set_provider_key: provider=%s key=%s encrypted and stored", provider_name, key_name)
        return True

    def set_provider_keys_bulk(self, provider_name: str, keys: dict) -> bool:
        """Encrypt and store multiple API keys for a provider at once."""
        p = self.get_provider(provider_name)
        if not p:
            return False
        stored = json.loads(p.encrypted_keys or "{}")
        for key_name, value in keys.items():
            stored[key_name] = _encrypt(value) if value else ""
        p.encrypted_keys = json.dumps(stored)
        self.db.commit()
        return True

    def _provider_to_dict(self, p: ProviderConfig) -> dict:
        """Return provider dict with keys_status (boolean presence, never plaintext)."""
        encrypted = json.loads(p.encrypted_keys or "{}")
        key_names = json.loads(p.key_names or "[]")
        keys_status = {k: bool(encrypted.get(k)) for k in key_names}
        return {
            "provider_name": p.provider_name,
            "provider_type": p.provider_type,
            "enabled": p.enabled,
            "key_names": key_names,
            "keys_status": keys_status,
        }

    def get_provider_dict(self, provider_name: str) -> Optional[dict]:
        p = self.get_provider(provider_name)
        return self._provider_to_dict(p) if p else None

    def get_decrypted_key(self, provider_name: str, key_name: str) -> Optional[str]:
        """Internal use only — returns decrypted key value."""
        p = self.get_provider(provider_name)
        if not p:
            return None
        keys = json.loads(p.encrypted_keys or "{}")
        encrypted = keys.get(key_name, "")
        return _decrypt(encrypted) if encrypted else None

    # ── Jobs ───────────────────────────────────────────────────────────────

    def get_all_jobs(self) -> List[dict]:
        jobs = self.db.query(JobConfig).all()
        logger.debug("get_all_jobs: returned %d jobs", len(jobs))
        return [self._job_to_dict(j) for j in jobs]

    def get_job(self, job_name: str) -> Optional[JobConfig]:
        logger.debug("get_job: job_name=%s", job_name)
        j = self.db.query(JobConfig).filter_by(job_name=job_name).first()
        if j:
            logger.debug("get_job: %s found enabled=%s cron=%s", job_name, j.enabled, j.cron_expression)
        else:
            logger.debug("get_job: %s not found", job_name)
        return j

    def update_job(self, job_name: str, enabled: Optional[bool] = None, cron_expression: Optional[str] = None) -> Optional[dict]:
        logger.info("update_job: job=%s enabled=%s cron=%s", job_name, enabled, cron_expression)
        j = self.get_job(job_name)
        if not j:
            logger.warning("update_job: job=%s not found", job_name)
            return None
        if enabled is not None:
            old = j.enabled
            j.enabled = enabled
            logger.debug("update_job: job=%s enabled %s→%s", job_name, old, enabled)
        if cron_expression is not None:
            old_cron = j.cron_expression
            j.cron_expression = cron_expression
            logger.debug("update_job: job=%s cron %r→%r", job_name, old_cron, cron_expression)
        self.db.commit()
        logger.info("update_job: job=%s updated", job_name)
        return self._job_to_dict(j)

    def mark_job_ran(self, job_name: str):
        logger.debug("mark_job_ran: job=%s", job_name)
        j = self.get_job(job_name)
        if j:
            j.last_run_at = datetime.now(timezone.utc)
            self.db.commit()
            logger.info("mark_job_ran: job=%s last_run_at=%s", job_name, j.last_run_at.isoformat())
        else:
            logger.warning("mark_job_ran: job=%s not found", job_name)

    def _job_to_dict(self, j: JobConfig) -> dict:
        # Get last log status
        last_log = (
            self.db.query(JobLog)
            .filter_by(job_name=j.job_name)
            .order_by(JobLog.started_at.desc())
            .first()
        )
        last_status = last_log.status.value if last_log else None

        return {
            "id": j.id,
            "job_name": j.job_name,
            "enabled": j.enabled,
            "cron_schedule": j.cron_expression,
            "last_status": last_status,
            "last_run_at": j.last_run_at.isoformat() if j.last_run_at else None,
            "next_run_at": j.next_run_at.isoformat() if j.next_run_at else None,
        }

    # ── Job Logs ───────────────────────────────────────────────────────────

    def log_job_start(self, job_name: str, task_id: Optional[str] = None) -> JobLog:
        log = JobLog(job_name=job_name, status=JobStatus.RUNNING, task_id=task_id)
        self.db.add(log)
        self.db.commit()
        self.db.refresh(log)
        return log

    def log_job_end(self, log_id: int, status: JobStatus, error: Optional[str] = None) -> JobLog:
        log = self.db.query(JobLog).filter_by(id=log_id).first()
        if log:
            log.status = status
            log.error_message = error
            log.ended_at = datetime.now(timezone.utc)
            if log.started_at:
                delta = log.ended_at - log.started_at
                log.duration_ms = int(delta.total_seconds() * 1000)
            self.db.commit()
        return log

    def get_job_logs(self, job_name: str, limit: int = 50) -> List[dict]:
        logs = (
            self.db.query(JobLog)
            .filter_by(job_name=job_name)
            .order_by(JobLog.started_at.desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "id": l.id,
                "job_name": l.job_name,
                "status": l.status.value,
                "task_id": l.task_id,
                "error_message": l.error_message,
                "started_at": l.started_at.isoformat() if l.started_at else None,
                "ended_at": l.ended_at.isoformat() if l.ended_at else None,
                "duration_ms": l.duration_ms,
            }
            for l in logs
        ]

    def dispatch_job(self, job_name: str) -> Optional[str]:
        """Dispatch the named job to Celery and return task_id(s)."""
        if job_name == "sync_portfolio":
            from app.modules.portfolio.providers.factory import list_supported_brokers
            from app.tasks.portfolio import sync_portfolio_task
            task_ids = [sync_portfolio_task.delay(broker=broker).id for broker in list_supported_brokers()]
            return ",".join(task_ids)
        if job_name == "refresh_prices":
            from app.tasks.portfolio import refresh_prices_task
            return refresh_prices_task.delay().id
        if job_name == "fetch_news":
            from app.tasks.news import fetch_news_task
            return fetch_news_task.delay().id
        if job_name == "daily_briefing":
            from app.tasks.ai import global_briefing_task
            return global_briefing_task.delay().id
        if job_name == "run_signals":
            from app.tasks.signals import generate_signals_task
            return generate_signals_task.delay().id
        raise ValueError(f"Unknown job: {job_name}")

    # ── Seed ───────────────────────────────────────────────────────────────

    @staticmethod
    def seed_defaults(db: Session):
        """Insert default providers and jobs on first startup (idempotent)."""
        for p in _DEFAULT_PROVIDERS:
            exists = db.query(ProviderConfig).filter_by(provider_name=p["provider_name"]).first()
            if not exists:
                db.add(ProviderConfig(**p))

        for j in _DEFAULT_JOBS:
            exists = db.query(JobConfig).filter_by(job_name=j["job_name"]).first()
            if not exists:
                db.add(JobConfig(**j))

        db.commit()
        logger.info("Config defaults seeded")
