class AppException(Exception):
    """Base exception for all application errors."""
    def __init__(
        self, 
        message: str,
        category: str = "SYSTEM",
        severity: str = "ERROR",
        retryable: bool = False,
        http_status: int = 500
    ):
        super().__init__(message)
        self.message = message
        self.category = category
        self.severity = severity
        self.retryable = retryable
        self.http_status = http_status


# --- Core Taxonomy Exceptions ---

class InfrastructureError(AppException):
    """Infrastructure-related exceptions (e.g. queue broker down)."""
    def __init__(self, message: str, severity: str = "CRITICAL", retryable: bool = True, http_status: int = 500):
        super().__init__(message, "INFRASTRUCTURE", severity, retryable, http_status)


class DatabaseError(InfrastructureError):
    """PostgreSQL database connectivity/execution exceptions."""
    def __init__(self, message: str, severity: str = "CRITICAL", retryable: bool = True, http_status: int = 500):
        super().__init__(message, severity, retryable, http_status)
        self.category = "DATABASE"


class ProviderError(AppException):
    """API gateway, Finnhub, Polygon, Yahoo, or external downstream service exceptions."""
    def __init__(self, message: str, severity: str = "ERROR", retryable: bool = True, http_status: int = 502):
        super().__init__(message, "PROVIDER", severity, retryable, http_status)


class ZerodhaAuthError(ProviderError):
    """Zerodha Kite Connect session missing or expired — user must reconnect via OAuth login."""
    def __init__(self, message: str):
        super().__init__(message, severity="WARNING", retryable=False, http_status=401)


class RateLimitError(ProviderError):
    """Provider returned HTTP 429 or otherwise signaled rate limiting."""
    def __init__(self, message: str, retry_after_seconds: float | None = None):
        super().__init__(message, severity="WARNING", retryable=True, http_status=429)
        self.retry_after_seconds = retry_after_seconds


class SyncError(ProviderError):
    """A broker/portfolio sync operation failed partway through."""
    def __init__(self, message: str, severity: str = "ERROR", retryable: bool = True):
        super().__init__(message, severity, retryable, http_status=502)


class ConfigurationError(ProviderError):
    """Provider is missing required configuration (credentials, endpoints) — not retryable."""
    def __init__(self, message: str):
        super().__init__(message, severity="ERROR", retryable=False, http_status=400)


class ProviderTimeoutError(ProviderError):
    """Provider call exceeded its configured timeout."""
    def __init__(self, message: str):
        super().__init__(message, severity="WARNING", retryable=True, http_status=504)


class RetryableProviderError(ProviderError):
    """Generic transient provider failure explicitly marked retryable by the caller."""
    def __init__(self, message: str, severity: str = "WARNING"):
        super().__init__(message, severity, retryable=True, http_status=502)


class EvaluationError(AppException):
    """AI engine evaluation pipeline exceptions."""
    def __init__(self, message: str, severity: str = "ERROR", retryable: bool = False, http_status: int = 500):
        super().__init__(message, "EVALUATION", severity, retryable, http_status)


class BusinessRuleError(AppException):
    """Violations of portfolio, transaction bounds, or rules exceptions."""
    def __init__(self, message: str, severity: str = "WARNING", retryable: bool = False, http_status: int = 400):
        super().__init__(message, "BUSINESS", severity, retryable, http_status)


class SecurityError(AppException):
    """General security violation exceptions."""
    def __init__(self, message: str, severity: str = "CRITICAL", retryable: bool = False, http_status: int = 403):
        super().__init__(message, "SECURITY", severity, retryable, http_status)


class ValidationError(AppException):
    """Request payload, parameter, schema validation failure exceptions."""
    def __init__(self, message: str, severity: str = "INFO", retryable: bool = False, http_status: int = 400):
        super().__init__(message, "VALIDATION", severity, retryable, http_status)


class AuthenticationError(AppException):
    """User login, invalid password, expired sessions, missing authorization headers exceptions."""
    def __init__(self, message: str, severity: str = "WARNING", retryable: bool = False, http_status: int = 401):
        super().__init__(message, "AUTHENTICATION", severity, retryable, http_status)


class AuthorizationError(AppException):
    """Insufficient scopes, role check failures exceptions."""
    def __init__(self, message: str, severity: str = "WARNING", retryable: bool = False, http_status: int = 403):
        super().__init__(message, "AUTHORIZATION", severity, retryable, http_status)


# --- Backward Compatibility Extensions ---

class ConflictError(BusinessRuleError):
    """Raised when a conflict occurs (e.g. duplicate email)."""
    def __init__(self, message: str):
        super().__init__(message, severity="WARNING", http_status=409)


class NotFoundError(BusinessRuleError):
    """Raised when a resource is not found."""
    def __init__(self, message: str):
        super().__init__(message, severity="INFO", http_status=404)


class PermissionDeniedError(AuthorizationError):
    """Raised when authorization fails."""
    def __init__(self, message: str):
        super().__init__(message, severity="WARNING")
