export class NotFoundError extends Error {}
export class ConflictError extends Error {}

// Mirrors app/core/exceptions.py's ValidationError (business-rule validation)
// -> 400. Thrown by dataReset.ts, providers.ts, and reset.ts for business-rule
// rejections (e.g. an unknown reset scope) — distinct from request-shape
// validation (malformed body/path params), which uses RequestValidationError
// -> 422 instead, matching FastAPI/pydantic's status code for the same kind
// of failure. Do not conflate the two: Python keeps pydantic's automatic 422
// request validation separate from the app's own 400 ValidationError, and
// this backend mirrors that split.
export class ValidationError extends Error {}

// Mirrors FastAPI/pydantic's automatic request-validation status (422) for
// malformed path params or request bodies — distinct from the business-rule
// ValidationError above (400).
export class RequestValidationError extends Error {}

// Mirrors app/core/exceptions.py's ProviderError/ConfigurationError/RateLimitError
// subset needed by the market-data provider layer (http_status: 502/400/429).
export class ProviderError extends Error {}
export class ConfigurationError extends ProviderError {}
export class RateLimitError extends ProviderError {}

// Mirrors app/core/exceptions.py's ZerodhaAuthError/GrowwAuthError/
// BinanceAuthError — ProviderError subclasses whose message is prefixed
// "AUTH_REQUIRED: ..." on stale/missing credentials (see PROVIDERS.md
// "Shared Patterns" — GET /portfolio/sync/status string-matches on that
// prefix in the last job log to surface a distinct auth_required status).
export class ZerodhaAuthError extends ProviderError {}
export class GrowwAuthError extends ProviderError {}
export class BinanceAuthError extends ProviderError {}
