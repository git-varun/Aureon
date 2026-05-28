"""Config services: CRUD for providers, jobs, and job logs. Manages key encryption."""
import json
import logging
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy.orm import Session

from app.modules.config.models import AllocationTarget, JobConfig, JobLog, JobStatus, ProviderConfig

logger = logging.getLogger("config.service")

# ── Default seed data ────────────────────────────────────────────────────────

_DEFAULT_PROVIDERS = [
    # Brokers
    {"provider_name": "zerodha", "provider_type": "broker",
     "key_names": '["api_key","api_secret","access_token","request_token"]'},
    {"provider_name": "groww", "provider_type": "broker", "key_names": '["api_key","api_secret"]'},
    {"provider_name": "binance", "provider_type": "broker", "key_names": '["api_key","api_secret"]'},
    {"provider_name": "coinbase", "provider_type": "broker", "key_names": '["api_key","api_secret","api_passphrase"]'},
    {"provider_name": "custom_equity", "provider_type": "broker", "key_names": '["holdings_json"]'},
    {"provider_name": "mf", "provider_type": "broker", "key_names": '["holdings_json"]'},
    {"provider_name": "epf", "provider_type": "broker", "key_names": '["corpus_json"]'},
    {"provider_name": "nps", "provider_type": "broker", "key_names": '["corpus_json"]'},

    # AI
    {"provider_name": "gemini", "provider_type": "ai", "key_names": '["api_key"]'},
    {"provider_name": "groq", "provider_type": "ai", "key_names": '["api_key"]'},

    # News
    {"provider_name": "rss", "provider_type": "news", "key_names": '[]'},
    {"provider_name": "finnhub", "provider_type": "news", "key_names": '["api_key"]'},
    {"provider_name": "newsapi", "provider_type": "news", "key_names": '["api_key"]'},
    {"provider_name": "alphavantage", "provider_type": "news", "key_names": '["api_key"]'},

    # Price
    {"provider_name": "binance_price", "provider_type": "price", "key_names": '[]'},
    {"provider_name": "yfinance", "provider_type": "price", "key_names": '[]'},
    {"provider_name": "coingecko", "provider_type": "price", "key_names": '["api_key"]'},
    {"provider_name": "coinmarketcap", "provider_type": "price", "key_names": '["api_key"]'},
    {"provider_name": "mfapi", "provider_type": "price", "key_names": '[]'},

    # Notification
    {"provider_name": "telegram", "provider_type": "notification", "key_names": '["bot_token","chat_id"]'},

    # Valuation
    {"provider_name": "bond_valuation", "provider_type": "valuation", "key_names": '[]', "enabled": True},
    {"provider_name": "epf_ppf_valuation", "provider_type": "valuation", "key_names": '[]', "enabled": True},
    {"provider_name": "eps_valuation", "provider_type": "valuation", "key_names": '[]', "enabled": True},
    {"provider_name": "nps_valuation", "provider_type": "valuation", "key_names": '[]', "enabled": True},
    {"provider_name": "insurance_valuation", "provider_type": "valuation", "key_names": '[]', "enabled": True},
    {"provider_name": "real_estate_valuation", "provider_type": "valuation", "key_names": '[]', "enabled": True},

    # Config
    {"provider_name": "signal_eligibility", "provider_type": "config", "key_names": '[]',
     "config": '{"types": ["equity", "crypto", "commodity"]}'},
]

_DEFAULT_ALLOCATION_TARGETS = [
    # Aureon CLASS_TARGET — basis points (0-10000)
    {"asset_class": "stocks", "target_pct": 4600},
    {"asset_class": "crypto", "target_pct": 700},
    {"asset_class": "funds", "target_pct": 1600},
    {"asset_class": "bonds", "target_pct": 1000},
    {"asset_class": "real_estate", "target_pct": 1000},
    {"asset_class": "retirement", "target_pct": 900},
    {"asset_class": "insurance", "target_pct": 200},
]

_DEFAULT_JOBS = [
    # User-tier: editable cron, full controls
    {"job_name": "sync_portfolio", "cron_expression": "0 9 * * 1-5", "enabled": True, "job_tier": "user"},
    {"job_name": "refresh_prices", "cron_expression": "*/15 9-15 * * 1-5", "enabled": True, "job_tier": "user"},
    {"job_name": "fetch_news", "cron_expression": "0 8 * * *", "enabled": True, "job_tier": "user"},
    {"job_name": "daily_briefing", "cron_expression": "0 7 * * *", "enabled": True, "job_tier": "user"},
    {"job_name": "run_signals", "cron_expression": "30 9 * * 1-5", "enabled": False, "job_tier": "user"},
    {"job_name": "seed_price_history", "cron_expression": "0 2 * * 0", "enabled": True, "job_tier": "user"},
    # System-tier: read-only cron, run-only
    {"job_name": "aggregate_sentiment", "cron_expression": "0 22 * * *", "enabled": True, "job_tier": "system"},
    {"job_name": "seed_fundamentals", "cron_expression": "0 3 * * 0", "enabled": True, "job_tier": "system"},
    {"job_name": "fetch_fx_rate", "cron_expression": "0 */4 * * *", "enabled": True, "job_tier": "system"},
    {"job_name": "compute_state", "cron_expression": "*/15 9-15 * * 1-5", "enabled": True, "job_tier": "system"},
    {"job_name": "accrue_epf", "cron_expression": "0 6 1 * *", "enabled": True, "job_tier": "system"},
    {"job_name": "accrue_eps", "cron_expression": "0 6 1 * *", "enabled": True, "job_tier": "system"},
    {"job_name": "bond_mtm", "cron_expression": "30 9 * * 1-5", "enabled": True, "job_tier": "system"},
    {"job_name": "insurance_premium", "cron_expression": "0 8 * * 1", "enabled": True, "job_tier": "system"},
    {"job_name": "compute_technicals", "cron_expression": "0 16 * * 1-5", "enabled": False, "job_tier": "user"},
    {"job_name": "notify_daily_summary", "cron_expression": "0 19 * * 1-5", "enabled": False, "job_tier": "user"},
    {"job_name": "clean_stale_signals", "cron_expression": "0 2 * * *", "enabled": True, "job_tier": "system"},
    {"job_name": "seed_market_universe", "cron_expression": "0 8 * * 1-5", "enabled": False, "job_tier": "system"},
    {"job_name": "refresh_watchlist_prices", "cron_expression": "*/30 9-16 * * 1-5", "enabled": False, "job_tier": "user"},
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


def _decrypt(token: str, context: str = "") -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except Exception as e:
        hint = f" [{context}]" if context else ""
        logger.error(
            "Decryption failed%s — likely SECRET_KEY mismatch. "
            "Re-save credentials via the Provider Config UI. err=%s",
            hint, type(e).__name__,
        )
        return ""


def _safe_json_load(data: str, default):
    try:
        return json.loads(data) if data else default
    except Exception as e:
        logger.error("Invalid JSON: %s | data=%s", str(e), data)
        return default


def _provider_to_dict(p: ProviderConfig) -> dict:
    encrypted = _safe_json_load(p.encrypted_keys, {})
    key_names = _safe_json_load(p.key_names, [])

    keys_status = {k: bool(encrypted.get(k)) for k in key_names}

    return {
        "provider_name": p.provider_name,  # ✅ FIX: was 'provider'
        "provider_type": p.provider_type,
        "enabled": p.enabled,
        "key_names": key_names,
        "keys_status": keys_status,
    }


def _validate_key(provider: ProviderConfig, key_name: str):
    allowed_keys = _safe_json_load(provider.key_names, [])

    if key_name not in allowed_keys:
        logger.error(
            "Invalid key '%s' for provider '%s'. Allowed: %s",
            key_name,
            provider.provider_name,
            allowed_keys,
        )
        raise ValueError(f"Invalid key: {key_name}")


# ── ConfigService ─────────────────────────────────────────────────────────────

class ConfigService:
    def __init__(self, db: Session):
        self.db = db

    # ── Providers ──────────────────────────────────────────────────────────

    def get_all_providers(self) -> List[dict]:
        providers = self.db.query(ProviderConfig).all()
        logger.debug("get_all_providers: returned %d providers", len(providers))
        return [_provider_to_dict(provider) for provider in providers]

    def get_provider(self, provider_name: str) -> type[ProviderConfig] | None:  # ✅ FIX
        logger.debug("get_provider: provider_name=%s", provider_name)

        provider = self.db.query(ProviderConfig).filter_by(
            provider_name=provider_name
        ).first()

        if provider:
            logger.debug("Provider found: %s enabled=%s", provider_name, provider.enabled)
        else:
            logger.debug("Provider not found: %s", provider_name)

        return provider

    def update_provider(self, provider_name: str, enabled: Optional[bool] = None) -> Optional[dict]:
        logger.info("update_provider: provider=%s enabled=%s", provider_name, enabled)
        provider = self.get_provider(provider_name)
        if not provider:
            logger.warning("update_provider: provider=%s not found", provider_name)
            return None
        if enabled is not None:
            old = provider.enabled
            provider.enabled = enabled
            logger.debug("update_provider: provider=%s enabled %s→%s", provider_name, old, enabled)
        self.db.commit()
        logger.info("update_provider: provider=%s updated", provider_name)
        return _provider_to_dict(provider)

    def set_provider_key(self, provider_name: str, key_name: str, value: str) -> bool:
        """Encrypt and store a single API key for a provider."""
        logger.info("set_provider_key: provider=%s key=%s value_len=%d", provider_name, key_name,
                    len(value) if value else 0)
        provider = self.get_provider(provider_name)
        if not provider:
            logger.warning("set_provider_key: provider=%s not found", provider_name)
            return False
        keys = json.loads(provider.encrypted_keys or "{}")
        keys[key_name] = _encrypt(value) if value else ""
        provider.encrypted_keys = json.dumps(keys)
        provider.enabled = True  # auto-enable when a key is saved
        self.db.commit()
        logger.info("set_provider_key: provider=%s key=%s encrypted and stored", provider_name, key_name)
        return True

    def set_provider_keys_bulk(self, provider_name: str, keys: dict) -> bool:
        """Encrypt and store multiple API keys for a provider at once."""
        provider = self.get_provider(provider_name)
        if not provider:
            return False
        stored = json.loads(provider.encrypted_keys or "{}")
        for key_name, value in keys.items():
            stored[key_name] = _encrypt(value) if value else ""
        provider.encrypted_keys = json.dumps(stored)
        self.db.commit()
        return True

    def get_provider_dict(self, provider_name: str) -> Optional[dict]:
        p = self.get_provider(provider_name)
        return _provider_to_dict(p) if p else None

    def get_providers_by_type(self, provider_type: str) -> List[dict]:
        """Return all providers of a given type (e.g. 'news', 'price', 'ai')."""
        providers = self.db.query(ProviderConfig).filter_by(provider_type=provider_type).all()
        return [_provider_to_dict(p) for p in providers]

    def get_decrypted_key(self, provider_name: str, key_name: str) -> Optional[str]:
        """Internal use only — returns decrypted key value."""
        p = self.get_provider(provider_name)
        if not p:
            return None
        keys = json.loads(p.encrypted_keys or "{}")
        encrypted = keys.get(key_name, "")
        return _decrypt(encrypted, context=f"{provider_name}.{key_name}") if encrypted else None

    # ── Jobs ───────────────────────────────────────────────────────────────

    def get_all_jobs(self) -> List[dict]:
        jobs = self.db.query(JobConfig).all()
        logger.debug("get_all_jobs: returned %d jobs", len(jobs))
        return [self._job_to_dict(j) for j in jobs]

    def get_job(self, job_name: str) -> type[JobConfig] | None:
        logger.debug("get_job: job_name=%s", job_name)
        j = self.db.query(JobConfig).filter_by(job_name=job_name).first()
        if j:
            logger.debug("get_job: %s found enabled=%s cron=%s", job_name, j.enabled, j.cron_expression)
        else:
            logger.debug("get_job: %s not found", job_name)
        return j

    def update_job(self, job_name: str, enabled: Optional[bool] = None, cron_expression: Optional[str] = None) -> \
    Optional[dict]:
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
            "job_tier": j.job_tier or "user",
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

    def attach_task_id(self, log_id: int, task_id: Optional[str]) -> None:
        """Store task_id on an open log entry without closing it."""
        log = self.db.query(JobLog).filter_by(id=log_id).first()
        if log and task_id:
            log.task_id = task_id
            self.db.commit()

    def log_job_end(self, log_id: int, status: JobStatus, error: Optional[str] = None, task_id: Optional[str] = None) -> \
    type[JobLog] | None:
        log = self.db.query(JobLog).filter_by(id=log_id).first()
        if log:
            log.status = status
            log.error_message = error
            log.ended_at = datetime.now(timezone.utc)
            if task_id:
                log.task_id = task_id
            if log.started_at:
                delta = log.ended_at - log.started_at
                log.duration_ms = int(delta.total_seconds() * 1000)
            self.db.commit()
        return log

    def update_job_log_status_by_task_id(self, task_id: str, status: JobStatus, error: Optional[str] = None) -> bool:
        """Find a JobLog by task_id and update its status. Handles comma-separated multi-tasks."""
        from sqlalchemy import or_
        log = self.db.query(JobLog).filter(
            or_(
                JobLog.task_id == task_id,
                JobLog.task_id.like(f"%{task_id}%")
            )
        ).order_by(JobLog.started_at.desc()).first()

        if log:
            log.status = status
            if error:
                log.error_message = error
            log.ended_at = datetime.now(timezone.utc)
            if log.started_at:
                delta = log.ended_at - log.started_at
                log.duration_ms = int(delta.total_seconds() * 1000)
            self.db.commit()
            logger.info("update_job_log_status_by_task_id: updated log_id=%d to %s", log.id, status)
            return True

        logger.warning("update_job_log_status_by_task_id: no log found for task_id=%s", task_id)
        return False

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

    def dispatch_job(self, job_name: str, log_id: Optional[int] = None, user_id: Optional[int] = None) -> Optional[str]:
        """Dispatch the named job to Celery and return task_id(s).

        Pre-assigns task IDs before dispatch so that the JobLog row is populated
        before the task runs — required for eager mode (task_always_eager=True)
        where .apply_async() executes the task synchronously inline.
        """
        import uuid

        def _pre_assign(tid: str) -> str:
            """Attach task_id to the open log entry before firing."""
            if log_id is not None:
                self.attach_task_id(log_id, tid)
            return tid

        if job_name == "sync_portfolio":
            from app.modules.portfolio.providers.factory import SUPPORTED_BROKERS
            from app.tasks.portfolio import sync_portfolio_task

            enabled = self.db.query(ProviderConfig).filter_by(
                provider_type="broker", enabled=True
            ).all()
            brokers = [
                p.provider_name for p in enabled
                if p.provider_name in SUPPORTED_BROKERS and _broker_has_keys(p)
            ]

            if not brokers:
                logger.warning("No enabled brokers for sync_portfolio")
                return None

            broker_ids = [(b, str(uuid.uuid4())) for b in brokers]
            _pre_assign(",".join(tid for _, tid in broker_ids))
            for broker, tid in broker_ids:
                sync_portfolio_task.apply_async(kwargs={"broker": broker, "user_id": user_id}, task_id=tid)
            return ",".join(tid for _, tid in broker_ids)

        task_id = _pre_assign(str(uuid.uuid4()))

        if job_name == "refresh_prices":
            from app.tasks.portfolio import refresh_prices_task
            refresh_prices_task.apply_async(task_id=task_id)
        elif job_name == "fetch_news":
            from app.tasks.news import fetch_news_task
            fetch_news_task.apply_async(task_id=task_id)
        elif job_name == "daily_briefing":
            from app.tasks.ai import global_briefing_task
            global_briefing_task.apply_async(task_id=task_id)
        elif job_name == "run_signals":
            from app.tasks.signals import generate_signals_task
            generate_signals_task.apply_async(task_id=task_id)
        elif job_name == "seed_price_history":
            from app.tasks.portfolio import seed_price_history_task
            seed_price_history_task.apply_async(task_id=task_id)
        elif job_name == "aggregate_sentiment":
            from app.tasks.news import aggregate_sentiment_task
            aggregate_sentiment_task.apply_async(task_id=task_id)
        elif job_name == "seed_fundamentals":
            from app.tasks.portfolio import seed_fundamentals_task
            seed_fundamentals_task.apply_async(task_id=task_id)
        elif job_name == "fetch_fx_rate":
            from app.tasks.portfolio import fetch_fx_rate_task
            fetch_fx_rate_task.apply_async(task_id=task_id)
        elif job_name == "compute_state":
            from app.tasks.portfolio import compute_state_task
            compute_state_task.apply_async(task_id=task_id)
        elif job_name == "accrue_epf":
            from app.tasks.fixed_return import accrue_epf_task
            accrue_epf_task.apply_async(task_id=task_id)
        elif job_name == "accrue_eps":
            from app.tasks.fixed_return import accrue_eps_task
            accrue_eps_task.apply_async(task_id=task_id)
        elif job_name == "bond_mtm":
            from app.tasks.fixed_return import bond_mtm_task
            bond_mtm_task.apply_async(task_id=task_id)
        elif job_name == "insurance_premium":
            from app.tasks.fixed_return import insurance_premium_task
            insurance_premium_task.apply_async(task_id=task_id)
        elif job_name == "compute_technicals":
            from app.tasks.signals import compute_technicals_task
            compute_technicals_task.apply_async(task_id=task_id)
        elif job_name == "notify_daily_summary":
            from app.tasks.notification import daily_summary_task
            daily_summary_task.apply_async(task_id=task_id)
        elif job_name == "clean_stale_signals":
            from app.tasks.signals import clean_stale_signals_task
            clean_stale_signals_task.apply_async(task_id=task_id)
        elif job_name == "seed_market_universe":
            from app.tasks.market import seed_market_universe_task
            seed_market_universe_task.apply_async(task_id=task_id)
        elif job_name == "refresh_watchlist_prices":
            from app.tasks.portfolio import refresh_watchlist_prices_task
            refresh_watchlist_prices_task.apply_async(task_id=task_id)
        else:
            raise ValueError(f"Unknown job: {job_name}")

        return task_id

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
            elif not exists.job_tier:
                exists.job_tier = j.get("job_tier", "user")

        for t in _DEFAULT_ALLOCATION_TARGETS:
            exists = db.query(AllocationTarget).filter_by(asset_class=t["asset_class"]).first()
            if not exists:
                db.add(AllocationTarget(**t))

        db.commit()
        logger.info("Config defaults seeded")

    # ── Allocation Targets ─────────────────────────────────────────────────

    def list_allocation_targets(self) -> List[dict]:
        rows = self.db.query(AllocationTarget).order_by(AllocationTarget.target_pct.desc()).all()
        return [_alloc_target_to_dict(r) for r in rows]

    def upsert_allocation_target(
            self, asset_class: str, target_pct: float,
            band_low_pct: Optional[float] = None, band_high_pct: Optional[float] = None,
            notes: Optional[str] = None,
    ) -> dict:
        row = self.db.query(AllocationTarget).filter_by(asset_class=asset_class).first()
        bp_target = int(round(target_pct * 10000))
        bp_low = int(round(band_low_pct * 10000)) if band_low_pct is not None else None
        bp_high = int(round(band_high_pct * 10000)) if band_high_pct is not None else None
        if row:
            row.target_pct = bp_target
            row.band_low_pct = bp_low
            row.band_high_pct = bp_high
            row.notes = notes
        else:
            row = AllocationTarget(
                asset_class=asset_class, target_pct=bp_target,
                band_low_pct=bp_low, band_high_pct=bp_high, notes=notes,
            )
            self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return _alloc_target_to_dict(row)


def _broker_has_keys(provider: ProviderConfig) -> bool:
    """Return True only if the broker has at least one non-empty API key stored."""
    encrypted = _safe_json_load(provider.encrypted_keys, {})
    return any(bool(v) for v in encrypted.values())


def _alloc_target_to_dict(r: AllocationTarget) -> dict:
    return {
        "asset_class": r.asset_class,
        "target_pct": (r.target_pct or 0) / 10000.0,
        "band_low_pct": (r.band_low_pct / 10000.0) if r.band_low_pct is not None else None,
        "band_high_pct": (r.band_high_pct / 10000.0) if r.band_high_pct is not None else None,
        "notes": r.notes,
    }
