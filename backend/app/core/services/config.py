from app.core.services.base import BaseService
import base64
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from cryptography.fernet import Fernet
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import ConfigurationError, ConflictError, InfrastructureError, NotFoundError, ValidationError
from app.core.logging import logger
from app.core.entities.config import (
    AllocationTarget,
    JobConfig,
    JobLog,
    JobStatus,
    ProviderConfig,
)
from app.core.repositories.config import ConfigRepository

# ── Encryption helpers ────────────────────────────────────────────────────────

def _fernet(secret: Optional[str] = None) -> Fernet:
    raw = (secret if secret is not None else settings.SECRET_KEY).encode()
    key = base64.urlsafe_b64encode(raw.ljust(32)[:32])
    return Fernet(key)

def _encrypt(value: str, secret: Optional[str] = None) -> str:
    return _fernet(secret).encrypt(value.encode()).decode()

def _decrypt(token: str, context: str = "") -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except Exception as e:
        logger.error(f"Decryption failed [{context}] — {type(e).__name__}")
        return ""

def _decrypt_strict(token: str, secret: str) -> str:
    """Like _decrypt but raises instead of swallowing — used by key rotation,
    where a silent "" would look like a legitimately-empty credential instead
    of a rotation failure."""
    return _fernet(secret).decrypt(token.encode()).decode()

def _decrypt_health(token: str) -> str:
    """Whether a stored credential still decrypts, without exposing the value.
    Used only by the Settings UI's credential list so a corrupted/rotation-failed
    key doesn't look identical to "not configured" — other _decrypt() call sites
    (broker sync, AI key checks) intentionally keep treating decrypt failure as
    absent and fail loudly downstream instead."""
    try:
        _fernet().decrypt(token.encode())
        return "ok"
    except Exception:
        return "corrupted"

def _safe_json_load(data: str, default: Any) -> Any:
    try:
        return json.loads(data) if data else default
    except Exception as e:
        logger.error(f"Invalid JSON: {e} | data={data}")
        return default

def _provider_to_dict(p: ProviderConfig) -> dict[str, Any]:
    encrypted = _safe_json_load(p.encrypted_keys, {})
    key_names = _safe_json_load(p.key_names, [])
    keys_status = {k: bool(encrypted.get(k)) for k in key_names}
    keys_health = {k: (_decrypt_health(encrypted[k]) if encrypted.get(k) else "not_set") for k in key_names}
    return {
        "provider_name": p.provider_name,
        "provider_type": p.provider_type,
        "enabled": p.enabled,
        "key_names": key_names,
        "keys_status": keys_status,
        "keys_health": keys_health,
        "config": _safe_json_load(p.config, {}),
        "status": p.status,
        "capabilities": _safe_json_load(p.capabilities, []),
        "priority": p.priority,
        "health": _safe_json_load(p.health, {}),
        "rate_limit": p.rate_limit,
        "timeout_seconds": p.timeout_seconds,
        "retry_policy": _safe_json_load(p.retry_policy, {}),
        "cache_ttl_seconds": p.cache_ttl_seconds,
    }

def _alloc_target_to_dict(r: AllocationTarget) -> dict[str, Any]:
    return {
        "asset_class": r.asset_class,
        "target_pct": (r.target_pct or 0) / 10000.0,
        "band_low_pct": (r.band_low_pct / 10000.0) if r.band_low_pct is not None else None,
        "band_high_pct": (r.band_high_pct / 10000.0) if r.band_high_pct is not None else None,
        "notes": r.notes,
    }

# Seed lists.
# `status`/`capabilities`/`priority` mirror app.core.providers.{lifecycle,capabilities}.
# Only the providers with a real adapter under app/infrastructure/providers/ get
# ACTIVE/PARTIAL + a non-empty capability list. Everything else is PLANNED — kept
# in this list (not deleted) so it stays visible in the UI as a roadmap item rather
# than being removed or silently presented as if it worked.
_DEFAULT_PROVIDERS = [
    {"provider_name": "zerodha", "provider_type": "broker", "key_names": '["api_key","api_secret","access_token","request_token"]', "status": "PARTIAL", "capabilities": '["PORTFOLIO","HOLDINGS"]', "priority": 10},
    {"provider_name": "groww", "provider_type": "broker", "key_names": '["api_key","api_secret"]', "status": "PARTIAL", "capabilities": '["PORTFOLIO","HOLDINGS"]', "priority": 11},
    {"provider_name": "binance", "provider_type": "broker", "key_names": '["api_key","api_secret"]', "status": "PARTIAL", "capabilities": '["PORTFOLIO","HOLDINGS","TRANSACTIONS"]', "priority": 12},
    {"provider_name": "coinbase", "provider_type": "broker", "key_names": '["api_key","api_secret","api_passphrase"]', "status": "PLANNED", "capabilities": "[]"},
    {"provider_name": "custom_equity", "provider_type": "broker", "key_names": '["holdings_json"]', "status": "PLANNED", "capabilities": "[]"},
    {"provider_name": "mf", "provider_type": "broker", "key_names": '["holdings_json"]', "status": "PLANNED", "capabilities": "[]"},
    {"provider_name": "epf", "provider_type": "broker", "key_names": '["corpus_json"]', "status": "PLANNED", "capabilities": "[]"},
    {"provider_name": "nps", "provider_type": "broker", "key_names": '["corpus_json"]', "status": "PLANNED", "capabilities": "[]"},
    {"provider_name": "gemini", "provider_type": "ai", "key_names": '["api_key"]', "status": "ACTIVE", "capabilities": '["AI_CHAT"]', "priority": 10},
    {"provider_name": "groq", "provider_type": "ai", "key_names": '["api_key"]', "status": "ACTIVE", "capabilities": '["AI_CHAT"]', "priority": 20},
    {"provider_name": "rss", "provider_type": "news", "key_names": '[]', "status": "PLANNED", "capabilities": "[]"},
    {"provider_name": "finnhub", "provider_type": "news", "key_names": '["api_key"]', "status": "ACTIVE", "capabilities": '["PRICE","NEWS","FUNDAMENTALS"]', "priority": 20},
    {"provider_name": "polygon", "provider_type": "price", "key_names": '["api_key"]', "status": "ACTIVE", "capabilities": '["PRICE","OHLC","CORPORATE_ACTIONS"]', "priority": 25},
    {"provider_name": "newsapi", "provider_type": "news", "key_names": '["api_key"]', "status": "PLANNED", "capabilities": "[]"},
    {"provider_name": "alphavantage", "provider_type": "news", "key_names": '["api_key"]', "status": "PLANNED", "capabilities": "[]"},
    {"provider_name": "binance_price", "provider_type": "price", "key_names": '[]', "status": "ACTIVE", "capabilities": '["PRICE","OHLC"]', "priority": 15},
    # Was seeded as "yfinance" — renamed to "yahoo" to match YahooAdapter.provider_name
    # (the registry key every other lookup uses). See migration a3f1c9d02b4e's follow-up
    # data fix and docs/architecture/provider-registry.md breaking-change notes.
    {"provider_name": "yahoo", "provider_type": "price", "key_names": '[]', "status": "ACTIVE", "capabilities": '["PRICE","NEWS","SEARCH"]', "priority": 30},
    {"provider_name": "coingecko", "provider_type": "price", "key_names": '["api_key"]', "status": "PLANNED", "capabilities": "[]"},
    {"provider_name": "coinmarketcap", "provider_type": "price", "key_names": '["api_key"]', "status": "PLANNED", "capabilities": "[]"},
    {"provider_name": "mfapi", "provider_type": "price", "key_names": '[]', "status": "ACTIVE", "capabilities": '["PRICE"]', "priority": 40},
    {"provider_name": "telegram", "provider_type": "notification", "key_names": '["bot_token","chat_id"]', "status": "PLANNED", "capabilities": "[]"},
    {"provider_name": "bond_valuation", "provider_type": "valuation", "key_names": '[]', "status": "PLANNED", "capabilities": "[]"},
    {"provider_name": "epf_ppf_valuation", "provider_type": "valuation", "key_names": '[]', "status": "PLANNED", "capabilities": "[]"},
    {"provider_name": "eps_valuation", "provider_type": "valuation", "key_names": '[]', "status": "PLANNED", "capabilities": "[]"},
    {"provider_name": "nps_valuation", "provider_type": "valuation", "key_names": '[]', "status": "PLANNED", "capabilities": "[]"},
    {"provider_name": "insurance_valuation", "provider_type": "valuation", "key_names": '[]', "status": "PLANNED", "capabilities": "[]"},
    {"provider_name": "real_estate_valuation", "provider_type": "valuation", "key_names": '[]', "status": "PLANNED", "capabilities": "[]"},
    {"provider_name": "signal_eligibility", "provider_type": "config", "key_names": '[]', "config": '{"types": ["equity", "crypto", "commodity"]}', "status": "ACTIVE", "capabilities": "[]"},
    {"provider_name": "financial_intelligence", "provider_type": "config", "key_names": '[]', "config": '{"expected_return_default": 0.11, "expected_return_high_risk": 0.14, "expected_return_low_risk": 0.07, "benchmark_annual_return": 0.10, "single_stock_concentration_threshold": 15.0, "sector_concentration_threshold": 30.0, "theme_concentration_threshold": 25.0, "diversification_asset_count_threshold": 10.0, "diversification_sector_count_threshold": 5.0, "diversification_target_score": 80.0, "risk_high_crypto_threshold": 20.0, "risk_high_equity_threshold": 75.0, "risk_low_crypto_threshold": 5.0, "risk_low_equity_threshold": 35.0}', "status": "ACTIVE", "capabilities": "[]"},
    # Per-FY EPF interest rates (e.g. {"2023-2024": 8.25}), maintained manually since
    # EPFO publishes no API for this — see EPF_ESTIMATE_SCOPE.md §4. Left empty rather
    # than seeded with guessed historical rates: an unconfigured FY must degrade the
    # estimate to "unavailable", not silently use a wrong number.
    {"provider_name": "epf_interest_rates", "provider_type": "config", "key_names": '[]', "config": '{"rates": {}}', "status": "ACTIVE", "capabilities": "[]"},
]

_DEFAULT_ALLOCATION_TARGETS = [
    {"asset_class": "stocks", "target_pct": 4600},
    {"asset_class": "crypto", "target_pct": 700},
    {"asset_class": "funds", "target_pct": 1600},
    {"asset_class": "bonds", "target_pct": 1000},
    {"asset_class": "real_estate", "target_pct": 1000},
    {"asset_class": "retirement", "target_pct": 900},
    {"asset_class": "insurance", "target_pct": 200},
]

_DEFAULT_JOBS = [
    {"job_name": "sync_portfolio", "enabled": True, "job_tier": "user"},
    {"job_name": "sync_zerodha", "enabled": False, "job_tier": "user"},
    {"job_name": "sync_binance", "enabled": False, "job_tier": "user"},
    {"job_name": "sync_groww", "enabled": False, "job_tier": "user"},
    {"job_name": "backfill_binance_spot", "enabled": True, "job_tier": "user"},
    {"job_name": "refresh_prices", "enabled": True, "job_tier": "user"},
    {"job_name": "fetch_news", "enabled": True, "job_tier": "user"},
    {"job_name": "refresh_fundamentals", "enabled": True, "job_tier": "user"},
    {"job_name": "refresh_mutual_fund_navs", "enabled": True, "job_tier": "user"},
    {"job_name": "daily_briefing", "enabled": True, "job_tier": "user"},
    {"job_name": "weekly_briefing", "enabled": True, "job_tier": "user"},
    {"job_name": "monthly_briefing", "enabled": True, "job_tier": "user"},
    {"job_name": "seed_price_history", "enabled": True, "job_tier": "user"},
    {"job_name": "seed_market_universe", "enabled": True, "job_tier": "system"},
    {"job_name": "validate_data_quality", "enabled": True, "job_tier": "system"},
]


class ConfigService(BaseService):
    def __init__(self, repo: ConfigRepository):
        self.repo = repo

    # ── Providers ──────────────────────────────────────────────────────────

    def get_all_providers(self) -> list[dict[str, Any]]:
        providers = self.repo.list_all_providers()
        return [_provider_to_dict(p) for p in providers]

    def get_provider(self, provider_name: str) -> Optional[ProviderConfig]:
        return self.repo.get_provider(provider_name)

    def get_provider_dict(self, provider_name: str) -> Optional[dict[str, Any]]:
        p = self.repo.get_provider(provider_name)
        return _provider_to_dict(p) if p else None

    def update_provider(self, provider_name: str, enabled: Optional[bool] = None, config: Optional[dict[str, Any]] = None, actor_id: Optional[uuid.UUID] = None) -> Optional[dict[str, Any]]:
        p = self.repo.get_provider(provider_name)
        if not p:
            raise NotFoundError(f"Provider {provider_name} not found")
        if enabled is not None:
            p.enabled = enabled
        if config is not None:
            p.config = json.dumps(config)
        self.repo.session.flush()
        from app.core.services.audit import log_audit_action
        log_audit_action(
            self.repo.session,
            action="config_provider_update",
            entity_type="provider_config",
            entity_id=provider_name,
            actor_id=actor_id,
            details={"enabled": enabled, "config": config}
        )
        self.repo.session.commit()
        self.repo.session.refresh(p)
        return _provider_to_dict(p)

    def set_provider_key(self, provider_name: str, key_name: str, value: str, actor_id: Optional[uuid.UUID] = None) -> bool:
        p = self.repo.get_provider(provider_name)
        if not p:
            raise NotFoundError(f"Provider {provider_name} not found")
        
        allowed_keys = _safe_json_load(p.key_names, [])
        if key_name not in allowed_keys:
            raise ValueError(f"Invalid key name {key_name} for provider {provider_name}")

        keys = _safe_json_load(p.encrypted_keys, {})
        keys[key_name] = _encrypt(value) if value else ""
        p.encrypted_keys = json.dumps(keys)
        self.repo.session.flush()
        from app.core.services.audit import log_audit_action
        log_audit_action(
            self.repo.session,
            action="config_provider_key_set",
            entity_type="provider_config",
            entity_id=provider_name,
            actor_id=actor_id,
            details={"key_name": key_name, "is_value_empty": not value}
        )
        self.repo.session.commit()
        return True

    def remove_provider_key(self, provider_name: str, key_name: str, actor_id: Optional[uuid.UUID] = None) -> bool:
        """Actually deletes a stored credential rather than overwriting it with an
        empty string — set_provider_key("", ...) leaves a blank entry behind
        forever; this removes the key from encrypted_keys entirely."""
        p = self.repo.get_provider(provider_name)
        if not p:
            raise NotFoundError(f"Provider {provider_name} not found")

        allowed_keys = _safe_json_load(p.key_names, [])
        if key_name not in allowed_keys:
            raise ValueError(f"Invalid key name {key_name} for provider {provider_name}")

        keys = _safe_json_load(p.encrypted_keys, {})
        if key_name not in keys:
            return False
        del keys[key_name]
        p.encrypted_keys = json.dumps(keys)
        self.repo.session.flush()
        from app.core.services.audit import log_audit_action
        log_audit_action(
            self.repo.session,
            action="config_provider_key_removed",
            entity_type="provider_config",
            entity_id=provider_name,
            actor_id=actor_id,
            details={"key_name": key_name}
        )
        self.repo.session.commit()
        return True

    def set_provider_keys_bulk(self, provider_name: str, keys: dict[str, str], actor_id: Optional[uuid.UUID] = None) -> bool:
        p = self.repo.get_provider(provider_name)
        if not p:
            raise NotFoundError(f"Provider {provider_name} not found")

        allowed_keys = _safe_json_load(p.key_names, [])
        stored = _safe_json_load(p.encrypted_keys, {})
        for key_name, value in keys.items():
            if key_name not in allowed_keys:
                raise ValueError(f"Invalid key name {key_name} for provider {provider_name}")
            stored[key_name] = _encrypt(value) if value else ""
        p.encrypted_keys = json.dumps(stored)
        self.repo.session.flush()
        from app.core.services.audit import log_audit_action
        log_audit_action(
            self.repo.session,
            action="config_provider_keys_bulk_set",
            entity_type="provider_config",
            entity_id=provider_name,
            actor_id=actor_id,
            details={"keys_list": list(keys.keys())}
        )
        self.repo.session.commit()
        return True

    def rotate_encryption_key(self, old_secret: str, new_secret: str, actor_id: Optional[uuid.UUID] = None) -> dict[str, Any]:
        """Re-encrypts every stored provider credential from old_secret to new_secret.

        Rotating settings.SECRET_KEY without this would silently blank every stored
        credential the next time it's read (_decrypt swallows failures and returns
        ""), with no error surfaced anywhere. This must run — and succeed — before
        SECRET_KEY is actually changed in the environment: call it with the current
        (old) key and the key you're about to deploy, then deploy the new key once
        this reports zero failures.

        Best-effort per provider: a decrypt failure on one key is recorded and
        skipped rather than aborting the whole rotation, since a partial rotation
        (with a clear failure report) is more recoverable than an all-or-nothing
        transaction spanning every provider.
        """
        providers = self.repo.list_all_providers()
        rotated_count = 0
        skipped_empty = 0
        failures: list[dict[str, str]] = []

        for p in providers:
            keys = _safe_json_load(p.encrypted_keys, {})
            if not keys:
                continue
            changed = False
            for key_name, token in keys.items():
                if not token:
                    skipped_empty += 1
                    continue
                try:
                    plaintext = _decrypt_strict(token, old_secret)
                    keys[key_name] = _encrypt(plaintext, new_secret)
                    changed = True
                    rotated_count += 1
                except Exception as e:
                    failures.append({
                        "provider_name": p.provider_name,
                        "key_name": key_name,
                        "error": type(e).__name__,
                    })
            if changed:
                p.encrypted_keys = json.dumps(keys)

        self.repo.session.flush()
        from app.core.services.audit import log_audit_action
        log_audit_action(
            self.repo.session,
            action="config_encryption_key_rotated",
            entity_type="provider_config",
            entity_id="*",
            actor_id=actor_id,
            details={"rotated_count": rotated_count, "skipped_empty": skipped_empty, "failure_count": len(failures)}
        )
        self.repo.session.commit()

        if failures:
            logger.error(f"Key rotation completed with {len(failures)} failures: {failures}")
        else:
            logger.info(f"Key rotation completed: {rotated_count} keys rotated, {skipped_empty} empty skipped")

        return {"rotated_count": rotated_count, "skipped_empty": skipped_empty, "failures": failures}

    def get_decrypted_key(self, provider_name: str, key_name: str) -> Optional[str]:
        p = self.repo.get_provider(provider_name)
        if not p:
            return None
        keys = _safe_json_load(p.encrypted_keys, {})
        encrypted = keys.get(key_name, "")
        return _decrypt(encrypted, context=f"{provider_name}.{key_name}") if encrypted else None

    def get_providers_by_type(self, provider_type: str) -> list[dict[str, Any]]:
        providers = self.repo.get_providers_by_type(provider_type)
        return [_provider_to_dict(p) for p in providers]

    def check_provider_health(self, provider_name: str) -> Optional[bool]:
        """Live-validates a provider's stored credentials via its health_check().
        Returns None (not True/False) when the provider has no registered adapter
        (e.g. PLANNED providers, valuation providers) — the caller should render
        that as presence-only status, not force a fake pass/fail."""
        from app.core.providers.registry import registry
        provider = registry.get(provider_name)
        if provider is None:
            return None

        cfg = self.repo.get_provider(provider_name)
        if cfg is None:
            return None

        key_names = _safe_json_load(cfg.key_names, [])
        credentials = {k: self.get_decrypted_key(provider_name, k) for k in key_names}
        credentials = {k: v for k, v in credentials.items() if v}
        if key_names and not credentials:
            return False

        if credentials:
            provider.authenticate(**credentials)
        try:
            return bool(provider.health_check())
        except Exception as e:
            logger.warning(f"health_check() raised for provider '{provider_name}': {e}")
            return False

    # ── Jobs ───────────────────────────────────────────────────────────────

    def get_all_jobs(self) -> list[dict[str, Any]]:
        jobs = self.repo.list_all_jobs()
        return [self._job_to_dict(j) for j in jobs]

    def get_job(self, job_name: str) -> Optional[JobConfig]:
        return self.repo.get_job(job_name)

    def update_job(self, job_name: str, enabled: Optional[bool] = None, actor_id: Optional[uuid.UUID] = None) -> Optional[dict[str, Any]]:
        j = self.repo.get_job(job_name)
        if not j:
            raise NotFoundError(f"Job {job_name} not found")
        if enabled is not None:
            j.enabled = enabled
        self.repo.session.flush()
        from app.core.services.audit import log_audit_action
        log_audit_action(
            self.repo.session,
            action="config_job_update",
            entity_type="job_config",
            entity_id=job_name,
            actor_id=actor_id,
            details={"enabled": enabled}
        )
        self.repo.session.commit()
        self.repo.session.refresh(j)
        return self._job_to_dict(j)

    def mark_job_ran(self, job_name: str) -> None:
        j = self.repo.get_job(job_name)
        if j:
            j.last_run_at = datetime.now(timezone.utc)
            self.repo.session.commit()

    # Weekday index (celery crontab's day_of_week, 0=Sunday) -> display abbreviation.
    _WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

    # job_name -> fully-qualified Celery task path. Shared by dispatch_job (which
    # jobs to send) and _schedule_display (which beat_schedule entry, if any, a
    # job maps to) so the two never drift against each other the way
    # JobConfig.cron_expression used to drift against the real beat_schedule.
    _TASK_MAPPING: dict[str, str] = {
        "sync_portfolio": "app.workers.ingestion.tasks.sync_portfolio_task",
        "sync_zerodha": "app.workers.ingestion.tasks.sync_zerodha_task",
        "sync_binance": "app.workers.ingestion.tasks.sync_binance_task",
        "sync_groww": "app.workers.ingestion.tasks.sync_groww_task",
        "backfill_binance_spot": "app.workers.ingestion.tasks.backfill_binance_spot_task",
        "refresh_prices": "app.workers.ingestion.tasks.refresh_prices_task",
        "fetch_news": "app.workers.ingestion.tasks.fetch_news_task",
        "refresh_fundamentals": "app.workers.ingestion.tasks.refresh_fundamentals_task",
        "refresh_mutual_fund_navs": "app.workers.ingestion.tasks.refresh_mutual_fund_navs_task",
        "daily_briefing": "app.workers.ingestion.tasks.daily_briefing_task",
        "weekly_briefing": "app.workers.ingestion.tasks.weekly_briefing_task",
        "monthly_briefing": "app.workers.ingestion.tasks.monthly_briefing_task",
        "seed_price_history": "app.workers.ingestion.tasks.seed_price_history_task",
        "seed_market_universe": "app.workers.ingestion.tasks.seed_market_universe_task",
        "validate_data_quality": "app.workers.ingestion.tasks.validate_data_quality_task",
        "admin_reprocess_all": "app.workers.ingestion.tasks.admin_reprocess_all_assets",
        "admin_repair": "app.workers.ingestion.tasks.admin_repair_jobs",
    }

    @classmethod
    def _humanize_crontab(cls, cb) -> str:
        """Best-effort human string for a celery crontab schedule. Not a general
        cron-string formatter — covers the hourly/every-N-hours/daily/weekly-at-time
        shapes actually used in celery_app.py's beat_schedule (see
        JOBCONFIG_SCHEDULING_SCOPE.md §3 for why this reads the real schedule
        instead of a separately-stored, driftable cron string)."""
        minutes = sorted(cb.minute)
        hours = sorted(cb.hour)
        days = sorted(cb.day_of_week)
        days_of_month = sorted(cb.day_of_month)
        full_hours = len(hours) == 24
        full_days = len(days) == 7
        full_days_of_month = len(days_of_month) == 31
        at_minute0 = minutes == [0]

        if full_hours and at_minute0:
            time_part = "hourly"
        elif len(hours) > 1 and at_minute0 and hours == list(range(0, 24, hours[1] - hours[0])):
            time_part = f"every {hours[1] - hours[0]}h"
        elif len(hours) == 1 and at_minute0:
            time_part = f"{hours[0]:02d}:00"
        else:
            time_part = ",".join(f"{h:02d}:{m:02d}" for h in hours for m in minutes)

        if not full_days_of_month:
            day_part = f"monthly (day {days_of_month[0]})" if len(days_of_month) == 1 else \
                "monthly (days " + ",".join(str(d) for d in days_of_month) + ")"
        elif full_days:
            day_part = "" if time_part == "hourly" or time_part.startswith("every ") else "daily"
        elif len(days) == 1:
            day_part = f"weekly {cls._WEEKDAY_NAMES[days[0]]}"
        else:
            day_part = ",".join(cls._WEEKDAY_NAMES[d] for d in days)

        return f"{day_part} {time_part}".strip() if day_part else time_part

    def _schedule_display(self, job_name: str) -> str:
        """Real, live beat cadence for a job, or 'manual only' if it has no
        beat_schedule entry — sourced directly from celery_app.py, never from a
        stored field, so it can't say something that isn't what actually runs."""
        task_name = self._TASK_MAPPING.get(job_name)
        if not task_name:
            return "manual only"
        from app.workers.celery_app import celery_app

        for entry in celery_app.conf.beat_schedule.values():
            if entry["task"] == task_name:
                return self._humanize_crontab(entry["schedule"])
        return "manual only"

    def _job_to_dict(self, j: JobConfig) -> dict[str, Any]:
        last_log = (
            self.repo.session.query(JobLog)
            .filter_by(job_name=j.job_name)
            .order_by(JobLog.started_at.desc())
            .first()
        )
        last_status = last_log.status.value if last_log else None
        return {
            "id": j.id,
            "job_name": j.job_name,
            "enabled": j.enabled,
            "schedule_display": self._schedule_display(j.job_name),
            "job_tier": j.job_tier or "user",
            "last_status": last_status,
            "last_run_at": j.last_run_at.isoformat() if j.last_run_at else None,
        }

    # ── Job Logs ───────────────────────────────────────────────────────────

    def log_job_start(self, job_name: str, task_id: Optional[str] = None) -> JobLog:
        log = JobLog(job_name=job_name, status=JobStatus.RUNNING, task_id=task_id)
        self.repo.save_job_log(log)
        self.repo.session.commit()
        self.repo.session.refresh(log)
        return log

    def attach_task_id(self, log_id: int, task_id: Optional[str]) -> None:
        log = self.repo.get_job_log(log_id)
        if log and task_id:
            log.task_id = task_id
            self.repo.session.commit()

    def log_job_end(self, log_id: int, status: JobStatus, error: Optional[str] = None, task_id: Optional[str] = None) -> Optional[JobLog]:
        log = self.repo.get_job_log(log_id)
        if log:
            log.status = status
            log.error_message = error
            log.ended_at = datetime.now(timezone.utc)
            if task_id:
                log.task_id = task_id
            if log.started_at:
                # timezone handling
                started = log.started_at
                if started.tzinfo is None:
                    started = started.replace(tzinfo=timezone.utc)
                delta = log.ended_at - started
                log.duration_ms = int(delta.total_seconds() * 1000)
            self.repo.session.commit()
        return log

    def update_job_log_status_by_task_id(self, task_id: str, status: JobStatus, error: Optional[str] = None) -> bool:
        log = self.repo.get_job_log_by_task_id(task_id)
        if log:
            log.status = status
            if error:
                log.error_message = error
            log.ended_at = datetime.now(timezone.utc)
            if log.started_at:
                started = log.started_at
                if started.tzinfo is None:
                    started = started.replace(tzinfo=timezone.utc)
                delta = log.ended_at - started
                log.duration_ms = int(delta.total_seconds() * 1000)
            self.repo.session.commit()
            return True
        return False

    def get_job_logs(self, job_name: Optional[str] = None, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
        logs = self.repo.list_job_logs(job_name, limit, offset)
        return [
            {
                "id": log_run.id,
                "job_name": log_run.job_name,
                "status": log_run.status.value,
                "task_id": log_run.task_id,
                "error_message": log_run.error_message,
                "started_at": log_run.started_at.isoformat() if log_run.started_at else None,
                "ended_at": log_run.ended_at.isoformat() if log_run.ended_at else None,
                "duration_ms": log_run.duration_ms,
            }
            for log_run in logs
        ]

    def count_job_logs(self, job_name: Optional[str] = None) -> int:
        return self.repo.count_job_logs(job_name)

    # ── Job Dispatching ───────────────────────────────────────────────────

    # Jobs that call out to a specific provider — dispatch_job checks the
    # provider is configured *before* queuing the Celery task, so an
    # unconfigured provider surfaces as one clean "not configured" job log
    # entry instead of a task that reaches the worker only to fail.
    _PROVIDER_REQUIRED_JOBS: dict[str, str] = {
        "sync_zerodha": "zerodha",
        "sync_binance": "binance",
        "sync_groww": "groww",
        "backfill_binance_spot": "binance",
    }

    # Jobs whose task needs a portfolio_id that only a portfolio-scoped caller
    # (e.g. POST /portfolios/{id}/sync/binance/backfill) can supply — the
    # generic "run this job" path (POST /config/jobs/{job_name}/run) has no
    # portfolio to pass, so reject it here instead of dispatching a task that's
    # guaranteed to fail on the worker.
    _REQUIRES_PORTFOLIO_ID: frozenset[str] = frozenset({"backfill_binance_spot"})

    # Dispatch-time concurrency guard TTL, per job — the only jobs dispatch_job
    # gates and the double-click ("Sync Now") scenario this guards against. Real
    # full-cycle (queue-to-completion) durations measured via TaskRun on
    # 2026-07-16 for the one broker with live credentials (binance): 42.2s and
    # 50.0s. 600s gives >10x margin over both observed runs — enough headroom
    # for a slow provider day without leaving a crashed-worker lock stuck for an
    # unreasonable time. See WORKERS_OBSERVABILITY_SCOPE.md §1.
    # backfill_binance_spot walks full account history (fromId pagination across
    # every ever-traded symbol) rather than one bounded "since last sync" call,
    # so it's given a much longer budget — not measured live yet, sized instead
    # for "won't expire mid-run on a large/high-frequency account."
    _JOB_LOCK_TTL_SECONDS: dict[str, int] = {
        "sync_zerodha": 600,
        "sync_binance": 600,
        "sync_groww": 600,
        "backfill_binance_spot": 3600,
    }

    def dispatch_job(
        self,
        job_name: str,
        log_id: Optional[int] = None,
        user_id: Optional[uuid.UUID] = None,
        extra_kwargs: Optional[dict[str, Any]] = None,
    ) -> str:
        # Pre-assign a task ID and log start
        task_id = str(uuid.uuid4())

        job = self.get_job(job_name)
        if job is not None and not job.enabled:
            message = f"Job '{job_name}' is disabled — not dispatched"
            logger.warning(message)
            if log_id is not None:
                self.log_job_end(log_id, JobStatus.FAILED, error=message)
            raise ConflictError(message)

        if job_name in self._REQUIRES_PORTFOLIO_ID and not (extra_kwargs or {}).get("portfolio_id"):
            message = f"Job '{job_name}' requires a portfolio_id — trigger it from its portfolio-scoped endpoint instead"
            logger.warning(message)
            if log_id is not None:
                self.log_job_end(log_id, JobStatus.FAILED, error=message)
            raise ValidationError(message)

        required_provider = self._PROVIDER_REQUIRED_JOBS.get(job_name)
        if required_provider:
            from app.core.redis import try_acquire_job_lock

            if not try_acquire_job_lock(job_name, task_id, self._JOB_LOCK_TTL_SECONDS.get(job_name, 600)):
                message = f"Job '{job_name}' is already running — rejected duplicate dispatch"
                logger.warning(message)
                if log_id is not None:
                    self.log_job_end(log_id, JobStatus.FAILED, error=message)
                raise ConflictError(message)

        if log_id is None:
            log = self.log_job_start(job_name, task_id)
            log_id = log.id
        else:
            self.attach_task_id(log_id, task_id)

        if required_provider:
            cfg = self.get_provider(required_provider)
            from app.core.providers.lifecycle import ProviderStatus
            if cfg is None or not cfg.enabled or cfg.status in (ProviderStatus.PLANNED.value, ProviderStatus.DISABLED.value):
                status = cfg.status if cfg else "NOT_FOUND"
                message = f"Provider '{required_provider}' is not configured (status={status}) — job not dispatched"
                logger.warning(message)
                from app.core.redis import release_job_lock
                release_job_lock(job_name, task_id)
                self.log_job_end(log_id, JobStatus.FAILED, error=message, task_id=task_id)
                raise ConfigurationError(message)

        try:
            import concurrent.futures

            from app.workers.celery_app import celery_app

            # Map legacy job names to celery tasks we will define
            celery_task_name = self._TASK_MAPPING.get(job_name)
            if not celery_task_name:
                raise ValueError(f"Unknown job {job_name}")

            kwargs = dict(extra_kwargs or {})
            if user_id:
                kwargs["user_id"] = str(user_id)
            kwargs["log_id"] = log_id

            # Bound send_task with a real thread-join timeout, independent of
            # kombu/celery's own connection-retry budget — a broker that's
            # reachable but unresponsive (e.g. paused, not stopped) can hang
            # this call far longer than any caller-facing request should wait.
            executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
            future = executor.submit(celery_app.send_task, celery_task_name, kwargs=kwargs, task_id=task_id)
            try:
                future.result(timeout=15.0)
            except concurrent.futures.TimeoutError:
                executor.shutdown(wait=False)
                raise TimeoutError(f"send_task for '{job_name}' timed out after 15s")
            executor.shutdown(wait=False)
            return task_id
        except Exception as e:
            logger.error(f"Failed to dispatch Celery task for {job_name}: {e}")
            if required_provider:
                from app.core.redis import release_job_lock
                release_job_lock(job_name, task_id)
            self.log_job_end(log_id, JobStatus.FAILED, error=str(e), task_id=task_id)
            raise InfrastructureError(f"Failed to dispatch job '{job_name}': {e}")

    # ── Seed ───────────────────────────────────────────────────────────────

    @staticmethod
    def seed_defaults(db: Session) -> None:
        """Insert default providers, jobs, and targets on startup.

        Each block below commits independently. A concurrent seed race in one
        block (e.g. two processes racing the yfinance->yahoo rename) must not
        roll back and silently discard the others — that's what previously
        masked provider status backfills (a rename conflict would abort the
        whole transaction, including unrelated PLANNED->PARTIAL/ACTIVE fixes,
        while still logging "seeded successfully").
        """
        from sqlalchemy.exc import IntegrityError

        # One-time rename: the price provider was originally seeded as "yfinance"
        # even though YahooAdapter.provider_name (and therefore the registry key
        # every ProviderFactory lookup uses) is "yahoo". Rename in place so any
        # credentials/config a user already set are preserved under the new key.
        try:
            stale_yfinance = db.scalar(select(ProviderConfig).filter_by(provider_name="yfinance"))
            if stale_yfinance and not db.scalar(select(ProviderConfig).filter_by(provider_name="yahoo")):
                stale_yfinance.provider_name = "yahoo"
            db.commit()
        except IntegrityError:
            db.rollback()
            logger.info("yfinance->yahoo rename raced concurrently; skipping.")

        try:
            for p in _DEFAULT_PROVIDERS:
                exists = db.scalar(select(ProviderConfig).filter_by(provider_name=p["provider_name"]))
                if not exists:
                    db.add(ProviderConfig(**p))
                elif exists.status == "PLANNED" and p.get("status") != "PLANNED":
                    # Backfill lifecycle/capability metadata on pre-existing rows (installs
                    # that seeded before this column existed) without touching credentials.
                    exists.status = p["status"]
                    exists.capabilities = p["capabilities"]
                    if "priority" in p:
                        exists.priority = p["priority"]
            db.commit()
        except IntegrityError:
            db.rollback()
            logger.info("Provider defaults already seeded concurrently.")

        try:
            for j in _DEFAULT_JOBS:
                exists = db.scalar(select(JobConfig).filter_by(job_name=j["job_name"]))
                if not exists:
                    db.add(JobConfig(**j))
                elif not exists.job_tier:
                    exists.job_tier = j.get("job_tier", "user")
            db.commit()
        except IntegrityError:
            db.rollback()
            logger.info("Job defaults already seeded concurrently.")

        try:
            for t in _DEFAULT_ALLOCATION_TARGETS:
                exists = db.scalar(select(AllocationTarget).filter_by(asset_class=t["asset_class"]))
                if not exists:
                    db.add(AllocationTarget(**t))
            db.commit()
            logger.info("Config defaults seeded successfully")
        except IntegrityError:
            db.rollback()
            logger.info("Allocation target defaults already seeded concurrently.")

        # Sync AI keys from environment — idempotent, only writes if slot is empty
        env_ai_keys = [
            ("gemini", "api_key", settings.GEMINI_API_KEY),
            ("groq", "api_key", settings.GROQ_API_KEY),
        ]
        synced_any = False
        for provider_name, key_name, env_value in env_ai_keys:
            if not env_value:
                continue
            p = db.scalar(select(ProviderConfig).filter_by(provider_name=provider_name))
            if not p:
                continue
            stored_keys = _safe_json_load(p.encrypted_keys, {})
            if not stored_keys.get(key_name):
                stored_keys[key_name] = _encrypt(env_value)
                p.encrypted_keys = json.dumps(stored_keys)
                synced_any = True
                logger.info(f"AI provider key synced from environment: {provider_name}.{key_name}")
        if synced_any:
            try:
                db.commit()
            except Exception:
                db.rollback()
                logger.warning("Failed to persist AI keys synced from environment")

        # Log AI provider readiness at startup
        for provider_name in ("gemini", "groq"):
            p = db.scalar(select(ProviderConfig).filter_by(provider_name=provider_name))
            if p:
                stored_keys = _safe_json_load(p.encrypted_keys, {})
                has_key = bool(stored_keys.get("api_key"))
                if not p.enabled:
                    status = "disabled"
                elif not has_key:
                    status = "missing_key — set via PUT /api/v1/config/providers/{name}/keys"
                else:
                    status = "ready"
                logger.info(f"AI provider status [{provider_name}]: {status}")

    # ── Allocation Targets ─────────────────────────────────────────────────

    def list_allocation_targets(self) -> list[dict[str, Any]]:
        rows = self.repo.list_allocation_targets()
        return [_alloc_target_to_dict(r) for r in rows]

    def upsert_allocation_target(
        self, asset_class: str, target_pct: float,
        band_low_pct: Optional[float] = None, band_high_pct: Optional[float] = None,
        notes: Optional[str] = None, actor_id: Optional[uuid.UUID] = None
    ) -> dict[str, Any]:
        row = self.repo.get_allocation_target(asset_class)
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
                band_low_pct=bp_low, band_high_pct=bp_high, notes=notes
            )
            self.repo.save_allocation_target(row)

        self.repo.session.flush()
        from app.core.services.audit import log_audit_action
        log_audit_action(
            self.repo.session,
            action="config_allocation_target_upsert",
            entity_type="allocation_target",
            entity_id=asset_class,
            actor_id=actor_id,
            details={"target_pct": target_pct, "band_low_pct": band_low_pct, "band_high_pct": band_high_pct}
        )
        self.repo.session.commit()
        self.repo.session.refresh(row)
        return _alloc_target_to_dict(row)
