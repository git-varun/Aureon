from enum import Enum


class ProviderStatus(str, Enum):
    """Lifecycle state of a provider, surfaced to the UI via ProviderConfig.status.

    PLANNED   — seeded metadata only, no adapter implementation exists yet.
    STUB      — adapter class exists but does not call a real external API.
    PARTIAL   — real implementation, but only some capabilities are backed (e.g. Zerodha: holdings, no orders).
    ACTIVE    — fully implemented and enabled.
    DISABLED  — implemented but turned off (by config, not by capability).
    DEPRECATED— implemented but scheduled for removal; still callable.
    FAILED    — health checks are consistently failing; registry may skip it in fallback chains.
    """

    PLANNED = "PLANNED"
    STUB = "STUB"
    PARTIAL = "PARTIAL"
    ACTIVE = "ACTIVE"
    DISABLED = "DISABLED"
    DEPRECATED = "DEPRECATED"
    FAILED = "FAILED"
