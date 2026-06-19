from datetime import datetime, timedelta, timezone

from app.core.database import SessionLocal
from app.core.redis import cache_provider_health
from app.domain.entities.system import FailedIngestion, Provider


def monitor_providers() -> None:
    with SessionLocal() as session:
        providers = session.query(Provider).all()
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(hours=1)
        
        health_data = []
        
        BATCH_SIZE = 500
        for i, provider in enumerate(providers):
            failures = session.query(FailedIngestion).filter(
                FailedIngestion.provider == provider.name,
                FailedIngestion.created_at >= cutoff
            ).count()
            
            if failures > 50:
                provider.health_status = "DEGRADED"
            elif failures > 10:
                provider.health_status = "DEGRADED"
            else:
                provider.health_status = "HEALTHY"
                
            provider.updated_at = now
            
            health_data.append({
                "provider_name": provider.name,
                "status": provider.health_status,
                "failures_last_hour": failures
            })
            
            if (i + 1) % BATCH_SIZE == 0:
                session.commit()
                
        session.commit()
        cache_provider_health(health_data)
