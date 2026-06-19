import os
from app.core.observability.logging import DEFAULT_SAMPLING_RATES

def validate_telemetry_config() -> None:
    """Validates telemetry configurations at application startup. Fails fast on configuration issues."""
    # 1. Validate Log Sampling Config Bounds
    for category, rates in DEFAULT_SAMPLING_RATES.items():
        for level, rate in rates.items():
            if not isinstance(rate, (int, float)) or not (0.0 <= rate <= 1.0):
                raise ValueError(
                    f"Telemetry Config Error: Invalid log sample rate for category '{category}' "
                    f"and level '{level}': {rate}. Must be a float between 0.0 and 1.0."
                )

    # 2. Verify Environment Override Sampling Bounds
    for key, val in os.environ.items():
        if key.startswith("LOG_SAMPLE_RATE_"):
            try:
                rate = float(val)
                if not (0.0 <= rate <= 1.0):
                    raise ValueError(f"Sample rate must be between 0.0 and 1.0.")
            except ValueError as e:
                raise ValueError(
                    f"Telemetry Config Error: Environment sample rate override '{key}' "
                    f"has invalid float value '{val}': {e}"
                )

    # 3. Verify Central Registry
    from app.core.observability.metrics import registry
    if not registry or not registry._metrics:
         raise RuntimeError("Telemetry Config Error: Prometheus metrics registry initialization failed.")
