class ProviderError(Exception):
    """Base class for normalized provider failures."""

    error_class = "provider_error"


class ProviderTimeout(ProviderError):
    error_class = "timeout"


class ProviderRejected(ProviderError):
    error_class = "rejected"


class ProviderUnavailable(ProviderError):
    error_class = "unavailable"
