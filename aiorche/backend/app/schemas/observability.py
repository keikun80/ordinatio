from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field

class ComputePoolStatus(BaseModel):
    pool_name: str
    infra: str  # On-Prem K8s, Docker-Compose, Bare-Metal, EKS, ECS, EC2
    pod_count: int
    waiting_queue: int
    gpu_memory_pct: Optional[float] = None
    gpu_metric_source: Optional[str] = None
    status: str = "HEALTHY"
    model_id: Optional[str] = None
    engine: Optional[str] = None  # vLLM, Ollama, TGI, SGLang, Triton
    workload: Optional[str] = None
    scaling_tech: Optional[str] = None
    endpoint_url: Optional[str] = None

class ModelTrafficShare(BaseModel):
    model_id: str
    name: str
    total_requests: int = 0
    share_pct: float = 0.0
    rps: float = 0.0

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
    model_traffic_breakdown: List[ModelTrafficShare] = []

class ObservabilitySummaryResponse(BaseModel):
    current_rps: float
    current_tps: float
    p95_ttft_ms: float
    error_rate: float
    cache_hit_rate: float
    total_tokens_today: int
    compute_pools: List[ComputePoolStatus]
    model_traffic_breakdown: List[ModelTrafficShare] = []
    uptime_seconds: float
    generated_at: datetime = Field(default_factory=datetime.utcnow)

class PromQLQueryRequest(BaseModel):
    query: str = Field(..., json_schema_extra={"example": "sum(rate(ai_inference_requests_total[5m]))"})

class PromQLQueryResponse(BaseModel):
    status: str = "success"
    data: Dict[str, Any]
