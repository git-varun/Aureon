"""Custom application exceptions."""


class AppException(Exception):
    """Base exception."""

    def __init__(self, message: str, code: str = "ERROR"):
        self.message = message
        self.code = code
        super().__init__(message)


class ConfigError(AppException):
    """Configuration error."""

    def __init__(self, message: str):
        super().__init__(message, "CONFIG_ERROR")


class DataFetchError(AppException):
    """Data fetch error."""

    def __init__(self, message: str):
        super().__init__(message, "DATA_FETCH_ERROR")


class ValidationError(AppException):
    """Validation error."""

    def __init__(self, message: str):
        super().__init__(message, "VALIDATION_ERROR")


class NotFoundError(AppException):
    """Resource not found."""

    def __init__(self, message: str):
        super().__init__(message, "NOT_FOUND")


class ConflictError(AppException):
    """Resource conflict."""

    def __init__(self, message: str):
        super().__init__(message, "CONFLICT")
