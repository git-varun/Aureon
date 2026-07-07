import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies import get_monitoring_service
from app.core.exceptions import NotFoundError
from app.core.services.monitoring import MonitoringService

router = APIRouter()

@router.get("/assets/{asset_id}/health")
def get_asset_health(asset_id: uuid.UUID, svc: MonitoringService = Depends(get_monitoring_service)) -> dict[str, Any]:
    try:
        return svc.get_asset_health(asset_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e.message)) from e

@router.get("/providers")
def get_provider_health(svc: MonitoringService = Depends(get_monitoring_service)) -> list[dict[str, Any]]:
    return svc.get_provider_health()

@router.get("/failed-ingestions")
def get_failed_ingestions(limit: int = 50, offset: int = 0, svc: MonitoringService = Depends(get_monitoring_service)) -> list[dict[str, Any]]:
    return svc.get_failed_ingestions(limit, offset)

@router.get("/dependencies")
def get_dependencies_status(svc: MonitoringService = Depends(get_monitoring_service)) -> dict[str, Any]:
    return svc.get_dependencies_status()

@router.get("/health/aggregate")
def get_aggregate_health(svc: MonitoringService = Depends(get_monitoring_service)) -> dict[str, Any]:
    return svc.get_aggregate_health()

@router.get("/backups/verify")
def verify_backups(svc: MonitoringService = Depends(get_monitoring_service)) -> dict[str, Any]:
    return svc.verify_backups()

@router.get("/restore/verify")
def verify_restore_procedures(svc: MonitoringService = Depends(get_monitoring_service)) -> dict[str, Any]:
    return svc.verify_restore_procedures()
