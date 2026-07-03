# Provider Registry

How external integrations (market data, news, brokers, AI models, ...) plug into Aureon's
backend. This is the architecture introduced to replace ad hoc, hardcoded provider
instantiation with a self-registering plugin system: `Router → Service → Repository →
ProviderFactory → Registry → Provider`.

Code lives under `backend/app/core/providers/` (the framework) and
`backend/app/infrastructure/providers/<category>/<name>/` (the plugins).

## Why

Before this architecture, adding or removing a market-data/news/AI provider meant editing
call sites throughout the codebase (`YahooAdapter()` instantiated directly in `NewsService`,
a hand-rolled `RateLimitTracker` only inside the AI service, no common interface across
Yahoo/Finnhub/Polygon). This made providers hard to test, hard to disable safely, and
impossible to manage from the UI.

The registry inverts that: providers register themselves at import time, services resolve
them by name or capability through `ProviderFactory`, and all runtime state (enabled,
credentials, priority, status) lives in the `config.provider_configs` table — not in code.

## Core Pieces

| Component | File | Responsibility |
|---|---|---|
| `Capability` | `core/providers/capabilities.py` | Enum of what a provider *can do* (PRICE, NEWS, AI_CHAT, HOLDINGS, ...). A provider declares a list of these via `capabilities()`. |
| `ProviderStatus` | `core/providers/lifecycle.py` | Enum of provider lifecycle state: `PLANNED, STUB, PARTIAL, ACTIVE, DISABLED, DEPRECATED, FAILED`. |
| `ProviderProtocol` | `core/providers/interfaces.py` | Base ABC every provider implements: `provider_name`, `health_check()`, `authenticate()`, `capabilities()`, plus optional `initialize()`/`metadata()`/`shutdown()` hooks. Auto-instruments every public method for tracing via `__init_subclass__`. |
| Capability-specific ABCs | `core/providers/interfaces.py` | `MarketDataProvider`, `NewsProvider`, `BrokerProvider`, `AIProvider`, `WalletProvider`, `EmbeddingProvider`, `OCRProvider`, `StorageProvider`, `NotificationProvider`, `CurrencyProvider`, `TaxProvider`, `CalendarProvider`, `RetirementProvider`. Each narrows the interface to that category's methods (e.g. `MarketDataProvider.get_quote(symbol)`). Only `MarketDataProvider`, `BrokerProvider`, and `AIProvider` have concrete subclasses today — the rest exist so a future provider has an interface to implement against without another architecture change. |
| `ProviderRegistry` | `core/providers/registry.py` | Singleton (`registry`). `register(cls)` instantiates and stores a provider class; `unregister(name)`; `get(name)`; `list(capability=None)`; `health(name)`; `discover()` import-scans `app.infrastructure.providers` so every `provider.py`'s self-registration call runs at least once. |
| `ProviderFactory` | `core/providers/factory.py` | The only thing services should call. `get(name, required=True)` resolves the registry instance, applies the DB row's `enabled`/`status`/credentials on top, and returns a ready-to-use provider (or raises/returns `None`). `get_fallback_chain(names)` resolves several in priority order, skipping unavailable ones. |
| `with_retry` / `CircuitBreaker` | `core/providers/retry.py` | Exponential-backoff retry decorator for `ProviderError` subclasses marked `retryable=True`, and a Redis-backed (in-memory fallback) per-key cooldown tracker. Generalizes the pattern that used to live only in the AI service's `RateLimitTracker`. |
| Error taxonomy | `core/exceptions.py` | `ProviderError` subclasses: `RateLimitError`, `SyncError`, `ConfigurationError`, `ProviderTimeoutError`, `RetryableProviderError`. Each carries a `retryable` flag `with_retry` reads. |
| `ProviderConfig` | `domain/entities/config.py` | The DB row per provider: `status`, `capabilities` (JSON), `priority`, `health`, `rate_limit`, `timeout_seconds`, `retry_policy`, `cache_ttl_seconds`, plus the pre-existing `enabled`/`key_names`/`encrypted_keys`/`config`. This is the source of truth the UI edits — no provider list is hardcoded in the API layer. |

## Provider Lifecycle States

| Status | Meaning |
|---|---|
| `PLANNED` | Roadmap item. No adapter code exists yet. Visible in the UI as "Not Configured" / "Planned" — **never deleted**, even though it has no backing implementation, so the roadmap stays discoverable. |
| `STUB` | Adapter class exists but does nothing real (not currently used by any of the 6 live providers). |
| `PARTIAL` | Adapter is real but only covers some of the category's capabilities (e.g. Zerodha: holdings-only, no order placement). |
| `ACTIVE` | Fully implemented and enabled for use. |
| `DISABLED` | Implemented, but turned off (via `enabled=false` in `ProviderConfig`, editable from the UI without a deploy). |
| `DEPRECATED` | Was active, now superseded — kept for reference/migration. |
| `FAILED` | Health check or repeated calls are failing; not currently backed by automated status transitions (manual/monitoring-driven today). |

## Current Provider Inventory

| Provider | Category | Capabilities | Status | Adapter |
|---|---|---|---|---|
| `yahoo` | market_data | PRICE, NEWS, SEARCH | ACTIVE | `infrastructure/providers/market_data/yahoo/provider.py` |
| `finnhub` | market_data | PRICE, NEWS, FUNDAMENTALS | ACTIVE | `infrastructure/providers/market_data/finnhub/provider.py` |
| `polygon` | market_data | PRICE, OHLC, CORPORATE_ACTIONS | ACTIVE | `infrastructure/providers/market_data/polygon/provider.py` |
| `zerodha` | broker | PORTFOLIO, HOLDINGS | PARTIAL | `infrastructure/providers/broker/zerodha/provider.py` |
| `gemini` | ai | AI_CHAT | ACTIVE | `infrastructure/providers/ai/gemini/provider.py` |
| `groq` | ai | AI_CHAT | ACTIVE | `infrastructure/providers/ai/groq/provider.py` |

Everything else in `config.provider_configs` (`groww`, `binance`, `binance_price`, `coinbase`,
`coingecko`, `coinmarketcap`, `custom_equity`, `mf`, `mfapi`, `epf`, `nps`, `rss`, `newsapi`,
`alphavantage`, `telegram`) is `status=PLANNED` — a DB row with no registered adapter class.
They exist purely as roadmap markers so the UI can show them as "Planned" rather than the
backend silently pretending they don't exist. `bond_valuation`, `epf_ppf_valuation`,
`eps_valuation`, `nps_valuation`, `insurance_valuation`, `real_estate_valuation`,
`signal_eligibility`, and `financial_intelligence` are a separate, older category — internal
calculation config rows, not provider plugins — and aren't part of this registry.

Query the live state at any time:

```python
from app.core.providers.registry import registry
from app.core.providers.capabilities import Capability
registry.list(Capability.NEWS)  # -> [FinnhubAdapter(...), YahooAdapter(...)]
```

## How a Service Resolves a Provider

Services never import a concrete provider class. They go through `ProviderFactory`:

```python
from app.core.providers.factory import ProviderFactory
from app.domain.services.config import ConfigService

factory = ProviderFactory(ConfigService(config_repo))
provider = factory.get("yahoo", required=False)  # None if disabled/PLANNED/unregistered
if provider:
    quote = provider.get_quote("AAPL")
```

For capability-driven fan-out (e.g. "call every registered news provider"), combine the
registry with the factory — see `NewsService.fetch_and_store` in
`domain/services/news.py`:

```python
for provider in registry.list(Capability.NEWS):
    live = factory.get(provider.provider_name, required=False)
    if live:
        headlines = live.get_news(symbol)
```

## Retry & Circuit Breaking

`with_retry(max_attempts=3, backoff_base=0.5, backoff_cap=8.0)` wraps a provider method and
retries on any `ProviderError` with `retryable=True` (e.g. `RateLimitError`,
`ProviderTimeoutError`), using exponential backoff. `ConfigurationError` and other
non-retryable errors propagate immediately — retrying a missing API key wastes time.

`CircuitBreaker` (`namespace="provider"` by default) tracks per-key cooldowns in Redis, with
an in-memory fallback if Redis is briefly unavailable. `AIService` uses this to cool down a
specific model after a 429 and try the next one in its fallback chain, without needing a
process restart to recover.

## Breaking Changes / Migration Notes

- **`yfinance` → `yahoo` rename**: the price provider's `ProviderConfig.provider_name` was
  originally seeded as `"yfinance"`, but `YahooAdapter.provider_name` (the key every registry
  lookup uses) is `"yahoo"`. This meant `ProviderFactory.get("yahoo", ...)` always silently
  returned `None`. Fixed via migration `a3f1c9d02b4e` + a one-time rename in
  `ConfigService.seed_defaults()` that preserves any credentials already set under the old
  key. If you have a fork with a pre-existing `yfinance` row, it will be renamed in place on
  next startup — no manual action needed.
- **`polygon` missing from seed defaults**: `PolygonAdapter` was migrated onto the plugin
  registry in Phase 1 but its `ProviderConfig` row was accidentally omitted from
  `_DEFAULT_PROVIDERS`, so it had no DB-backed enable/disable/credentials until this fix. It
  now seeds as `ACTIVE` with `["PRICE","OHLC","CORPORATE_ACTIONS"]`. Existing installs get the
  row backfilled automatically on next `seed_defaults()` run (startup or `bootstrap.sh`).
- **No response-shape changes**: this refactor is purely internal layering — no API contract
  changed. See `docs/architecture/adding-a-provider.md` for how to extend the system.
