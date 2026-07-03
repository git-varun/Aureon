# Adding (or Removing) a Provider

Goal of the plugin architecture (see `docs/architecture/provider-registry.md` for the full
design): adding a provider should require **one new folder + one interface implementation +
one registration call + credentials in the UI** — no edits anywhere else. Removing a provider
should require only disabling it (or deleting its folder) — no edits to callers.

## Adding a Real Provider

### 1. Pick (or add) a capability-specific interface

Check `backend/app/core/providers/interfaces.py` for an ABC matching what you're building:
`MarketDataProvider`, `NewsProvider`, `BrokerProvider`, `WalletProvider`, `AIProvider`,
`EmbeddingProvider`, `OCRProvider`, `StorageProvider`, `NotificationProvider`,
`CurrencyProvider`, `TaxProvider`, `CalendarProvider`, `RetirementProvider`. If none fit,
add a new one here — it's a small ABC narrowing `ProviderProtocol`'s `fetch()`/`sync()`-style
methods to the category's actual shape (e.g. `MarketDataProvider.get_quote(symbol)`).

### 2. Create the plugin folder

Convention: `backend/app/infrastructure/providers/<category>/<name>/`

```
market_data/
  polygon/
    __init__.py      # empty
    provider.py       # the adapter class + registration call
```

`category` matches the interface's domain (`market_data`, `broker`, `ai`, `news`, ...).
`name` matches the value you'll use as `provider_name` and the `ProviderConfig.provider_name`
DB key — pick something stable, since renaming it later requires a migration (see the
`yfinance`→`yahoo` incident in `provider-registry.md`).

### 3. Implement the interface

```python
# app/infrastructure/providers/market_data/example/provider.py
from app.core.providers.capabilities import Capability
from app.core.providers.interfaces import MarketDataProvider
from app.core.providers.registry import registry
from app.core.exceptions import ConfigurationError

class ExampleAdapter(MarketDataProvider):
    def __init__(self):
        self._api_key: str | None = None

    @property
    def provider_name(self) -> str:
        return "example"

    def capabilities(self) -> list[Capability]:
        return [Capability.PRICE]

    def health_check(self) -> bool:
        return self._api_key is not None

    def authenticate(self, **credentials) -> None:
        self._api_key = credentials.get("api_key")

    def get_quote(self, symbol: str):
        if not self._api_key:
            raise ConfigurationError("Example provider has no API key configured")
        # ... real HTTP call, raise ProviderError subclasses on failure ...

# Self-register at import time — this is the ONE line that makes the provider discoverable.
registry.register(ExampleAdapter)
```

Rules that keep this pattern working:
- **No provider-specific error handling elsewhere.** Raise `ProviderError` subclasses
  (`RateLimitError`, `ConfigurationError`, `ProviderTimeoutError`, etc. — see
  `core/exceptions.py`) from inside the provider; callers only ever catch the base taxonomy.
- **Don't call the constructor from services.** `registry.register(cls)` instantiates it
  once; everything else resolves it via `ProviderFactory.get(name)`.
- **`authenticate()` receives whatever keys `ProviderConfig.key_names` lists**, decrypted.
  Don't read env vars/settings directly inside the provider for per-provider credentials —
  that defeats the "UI manages credentials" goal. (Reading global, non-provider-specific
  settings like `DATABASE_URL` is fine; that's infrastructure config, not provider config.)

### 4. Register the DB row

Add an entry to `_DEFAULT_PROVIDERS` in `backend/app/domain/services/config.py`:

```python
{"provider_name": "example", "provider_type": "price", "key_names": '["api_key"]',
 "status": "ACTIVE", "capabilities": '["PRICE"]', "priority": 40},
```

`seed_defaults()` inserts this idempotently on next startup/bootstrap — no migration needed
for the row itself (the *columns* were added once, in migration `a3f1c9d02b4e`; new rows just
use them). Then set the actual API key through the UI (`ConfigService.set_provider_key` /
`set_provider_keys_bulk`) or a bootstrap script — never hardcode a real secret in
`_DEFAULT_PROVIDERS`.

### 5. Use it from a service

```python
provider = provider_factory.get("example", required=False)
if provider:
    quote = provider.get_quote("AAPL")
```

Never `from app.infrastructure.providers.market_data.example.provider import ExampleAdapter`
in a service — always resolve through `ProviderFactory`/`registry`, or the "swap provider
without touching callers" property breaks.

### 6. Test it

- Interface-conformance test (mock the HTTP layer, assert the class implements the ABC
  correctly) — see `backend/tests/providers/test_yahoo.py` for the pattern (mocked
  `yfinance.Ticker`, no live network calls).
- If it's resolved through `ProviderFactory` inside a service, add/extend an integration-style
  test like `backend/tests/providers/test_ai_provider_rotation.py` (real provider path, mocked
  transport, not the `AUREON_TEST_MOCK_AI`-style escape hatch).
- Registry/factory mechanics themselves are covered generically in
  `backend/tests/providers/test_registry_and_retry.py` and
  `backend/tests/providers/test_provider_factory.py` — you don't need to re-test those.

## Planning a Provider Without Building It Yet

If you just want the roadmap entry (UI shows "Planned", nothing else changes), add only step
4 above with `"status": "PLANNED", "capabilities": "[]"` and skip 1–3, 5–6 entirely. This is
how the 15 not-yet-built integrations (Groww, Binance, Coinbase, EPF/NPS automation, Google
Drive/OneDrive/Dropbox, Telegram, NewsAPI, AlphaVantage, CoinGecko, CoinMarketCap, MFAPI, RSS)
are represented today — **do not delete these rows** even if they look unused; that's the
explicit design (see `provider-registry.md`'s lifecycle table). Deleting a `PLANNED` row
removes it from the roadmap UI with no way to recover the "someone already scoped this"
signal.

## Removing / Disabling a Provider

- **Temporarily disable** (keeps credentials, can re-enable later): set
  `ProviderConfig.enabled = False` via the UI or `ConfigService.update_provider(name,
  enabled=False)`. `ProviderFactory.get(name)` will then raise `ConfigurationError` (if
  `required=True`) or return `None` (if `required=False`) — callers using
  `get_fallback_chain`/`registry.list()` fan-out patterns skip it automatically.
- **Permanently remove code** (e.g. deprecating an adapter): delete the
  `infrastructure/providers/<category>/<name>/` folder and call
  `registry.unregister(name)` if you need it gone from a running process without a restart.
  Set the `ProviderConfig.status` to `DEPRECATED` rather than deleting the row, so the
  history/roadmap stays intact (consistent with never deleting `PLANNED` rows either).
- **Never**: add `if provider_name == "x"` branches in a service to special-case a provider's
  removal. If a caller needs conditional behavior per provider, that's what `capabilities()`
  and `ProviderStatus` are for.

## Common Pitfalls (from real incidents in this codebase)

- **`provider_name` mismatch between the DB seed row and the adapter class.** The registry key
  used by every `ProviderFactory.get(name)` call is `<Adapter>.provider_name`, not the
  `ProviderConfig.provider_name` column value — they must match exactly, or the factory
  silently returns `None`/raises `ConfigurationError` even though the adapter is registered
  and healthy. (This is exactly what happened with `yfinance`/`yahoo` — see
  `provider-registry.md`.)
- **Forgetting the `_DEFAULT_PROVIDERS` entry.** A registered adapter with no DB row still
  "works" (`ProviderFactory` falls back to a bare, unauthenticated instance when `cfg is
  None`), but it can't be disabled, prioritized, or given credentials from the UI — defeating
  the point. (This happened with `polygon` — see `provider-registry.md`'s breaking-changes
  section.) Always add both.
- **Circular imports from type-hint-only imports.** If your new module needs a type from
  `app.domain.services.*` purely for an annotation, import it under `if TYPE_CHECKING:` and
  quote the annotation. `app.core.providers.factory` hit this with `ConfigService` — a
  top-level import created a cycle whenever `factory.py` was imported before
  `app.domain.services`.
