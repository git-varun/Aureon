from app.core.config import settings


def evaluate_quote_sla(quote_age_seconds: int | None) -> bool:
    if quote_age_seconds is None:
        return False
    return quote_age_seconds <= settings.SLA_QUOTE_MAX_AGE_SEC

def evaluate_news_sla(news_age_seconds: int | None) -> bool:
    if news_age_seconds is None:
        return False
    return news_age_seconds <= settings.SLA_NEWS_MAX_AGE_SEC

def evaluate_signal_sla(signal_age_seconds: int | None) -> bool:
    if signal_age_seconds is None:
        return False
    return signal_age_seconds <= settings.SLA_SIGNAL_MAX_AGE_SEC

def evaluate_asset_health(quote_age: int | None, news_age: int | None, signal_age: int | None) -> str:
    # Minimal viable health logic based on SLAs
    # Allowed values: HEALTHY, STALE, DEGRADED, UNKNOWN
    
    if quote_age is None and news_age is None and signal_age is None:
        return "UNKNOWN"
        
    quote_healthy = evaluate_quote_sla(quote_age)
    news_healthy = evaluate_news_sla(news_age) if news_age is not None else True
    signal_healthy = evaluate_signal_sla(signal_age) if signal_age is not None else True
    
    if quote_healthy and news_healthy and signal_healthy:
        return "HEALTHY"
        
    # If quote is stale but it exists, might be STALE
    # If quote exceeds SLA drastically or missing when it should exist, DEGRADED
    if not quote_healthy:
        return "STALE" if (quote_age and quote_age <= settings.SLA_QUOTE_MAX_AGE_SEC * 3) else "DEGRADED"
        
    return "STALE"
