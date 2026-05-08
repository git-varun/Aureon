"""Analytics request/response schemas (Pydantic)."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class AIRecommendationResponse(BaseModel):
    id: int
    briefing_id: Optional[int] = None
    asset_id: Optional[int] = None
    action: str
    conviction: Optional[int] = None
    confidence: Optional[float] = None
    risk_level: Optional[str] = None
    time_horizon: Optional[str] = None
    entry_price: Optional[float] = None
    exit_price: Optional[float] = None
    analysis_detail: Optional[Dict[str, Any]] = None
    expires_at: Optional[datetime] = None
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class OptimizationRunRequest(BaseModel):
    optimization_type: str = "ai_driven"


class OptimizationStatusResponse(BaseModel):
    result_id: int
    status: str
    error_message: Optional[str] = None


class OptimizationResultResponse(BaseModel):
    id: int
    task_id: Optional[str] = None
    status: str
    optimization_type: Optional[str] = None
    target_allocation: Optional[Dict[str, Any]] = None
    rebalance_actions: Optional[List[Dict[str, Any]]] = None
    risk_metrics: Optional[Dict[str, Any]] = None
    confidence_score: Optional[float] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
