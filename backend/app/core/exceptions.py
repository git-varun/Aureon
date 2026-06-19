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
