from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field

class ComputePoolStatus(BaseModel):
    pool_name: str
    infra: str  # EKS, ECS, EC2
    pod_count: int
    waiting_queue: int
    gpu_memory_pct: float
    status: str = "HEALTHY"

class TelemetryPacket(BaseModel):
    timestamp: float
    rps: float
    tps: float
    ttft_ms: float
    error_rate_5xx: float
    cache_hit_rate: float
    cumulative_cost_krw: float
    active_connections: int
    compute_pools: List[ComputePoolStatus]

class ObservabilitySummaryResponse(BaseModel):
    current_rps: float
    current_tps: float
    p95_ttft_ms: float
    error_rate: float
    cache_hit_rate: float
    total_tokens_today: int
    compute_pools: List[ComputePoolStatus]
    uptime_seconds: float
    generated_at: datetime = Field(default_factory=datetime.utcnow)

class PromQLQueryRequest(BaseModel):
    query: str = Field(..., json_schema_extra={"example": "sum(rate(ai_inference_requests_total[5m]))"})

class PromQLQueryResponse(BaseModel):
    status: str = "success"
    data: Dict[str, Any]
