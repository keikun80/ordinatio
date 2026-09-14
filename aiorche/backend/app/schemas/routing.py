from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict

class TrafficWeightItem(BaseModel):
    model_id: str = Field(..., json_schema_extra={"example": "meta-llama/Llama-3.1-8B-Instruct"})
    weight: int = Field(..., ge=0, le=100, json_schema_extra={"example": 80})

class RouteMatchConditions(BaseModel):
    path_prefix: Optional[str] = Field(default=None, json_schema_extra={"example": "/v1/routes/financial-advisor"})
    tenant_codes: Optional[List[str]] = Field(default_factory=list, json_schema_extra={"example": ["WM-01"]})
    headers: Optional[Dict[str, str]] = Field(default_factory=dict, json_schema_extra={"example": {"x-route-tag": "wealth"}})

class DryRunRequest(BaseModel):
    traffic_weights: List[TrafficWeightItem] = Field(..., min_length=1)
    route_name: str = Field(default="financial-advisor-v1")
    failover_model_id: Optional[str] = None
    failover_chain: Optional[List[str]] = Field(default_factory=list)
    match_conditions: Optional[Dict[str, Any]] = None

class DryRunResponse(BaseModel):
    is_valid: bool
    total_weight: int
    validation_errors: List[str] = Field(default_factory=list)
    estimated_latency_ms: float = 1.2
    active_endpoints_count: int = 0

class CanaryDeployRequest(BaseModel):
    route_name: str = Field(default="financial-advisor-v1")
    traffic_weights: List[TrafficWeightItem] = Field(..., min_length=1)
    load_balancing_strategy: str = Field(default="LeastQueueDepth")  # LeastQueueDepth, PrefixCacheAffinity, RoundRobin
    failover_model_id: Optional[str] = None
    failover_chain: Optional[List[str]] = Field(default_factory=list)
    match_conditions: Optional[Dict[str, Any]] = None
    priority: Optional[int] = 10
    is_active: Optional[bool] = True
    description: Optional[str] = None
    deployed_by: str = Field(default="admin")

class CanaryDeployResponse(BaseModel):
    status: str = "success"
    policy_id: str
    route_name: str
    xds_revision: str
    deployed_at: datetime
    applied_weights: List[TrafficWeightItem]
    load_balancing_strategy: str
    failover_model_id: Optional[str] = None
    failover_chain: Optional[List[str]] = None
    match_conditions: Optional[Dict[str, Any]] = None
    envoy_ack: bool = True
    message: str = "Envoy xDS 라우팅 정책이 무중단 실시간 배포되었습니다."

class RoutePolicyCreate(BaseModel):
    route_name: str = Field(..., json_schema_extra={"example": "customer-service-v1"})
    traffic_weights: List[TrafficWeightItem] = Field(..., min_length=1)
    load_balancing_strategy: str = Field(default="LeastQueueDepth")
    failover_model_id: Optional[str] = None
    failover_chain: Optional[List[str]] = Field(default_factory=list)
    match_conditions: Optional[Dict[str, Any]] = Field(default_factory=dict)
    priority: int = Field(default=10, ge=1, le=100)
    is_active: bool = True
    description: Optional[str] = None
    deployed_by: str = "admin"

class RoutePolicyUpdate(BaseModel):
    traffic_weights: Optional[List[TrafficWeightItem]] = None
    load_balancing_strategy: Optional[str] = None
    failover_model_id: Optional[str] = None
    failover_chain: Optional[List[str]] = None
    match_conditions: Optional[Dict[str, Any]] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None
    description: Optional[str] = None
    deployed_by: Optional[str] = "admin"

class RoutingPolicyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    policy_id: str
    route_name: str
    traffic_weights: List[dict]
    load_balancing_strategy: str
    failover_model_id: Optional[str] = None
    failover_chain: Optional[List[Any]] = None
    match_conditions: Optional[Dict[str, Any]] = None
    priority: Optional[int] = 10
    is_active: Optional[bool] = True
    description: Optional[str] = None
    xds_revision: str
    deployed_by: str
    deployed_at: datetime

class RouteTestCallRequest(BaseModel):
    route_name: str
    method: str = "path"  # "path" or "header"
    message: str = "안녕하세요. 라우팅 테스트 요청입니다."

class RouteTestCallResponse(BaseModel):
    is_success: bool
    status_code: Optional[int] = None
    latency_ms: float
    target_url: str
    request_headers: Dict[str, str]
    response_body: Optional[Any] = None
    error_message: Optional[str] = None
    dispatched_route: str

class AgentRouterPolicyItem(BaseModel):
    policy_id: str
    name: str
    description: Optional[str] = None
    is_active: bool = True
    config: Dict[str, Any]
    updated_at: Optional[datetime] = None

class AgentRouterPoliciesResponse(BaseModel):
    policies: List[AgentRouterPolicyItem]
    active_policy: str = "QualityFirst"

class AgentRouterPoliciesUpdate(BaseModel):
    policies: List[AgentRouterPolicyItem]


