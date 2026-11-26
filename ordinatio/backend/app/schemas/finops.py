from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field, ConfigDict

def get_utc_now() -> datetime:
    return datetime.now(timezone.utc)

class ModelPricingInfo(BaseModel):
    model_id: str
    alias: str
    backend_infra: str
    input_price_per_1k: float
    output_price_per_1k: float
    cache_discount_ratio: float

class FinOpsPricingMatrix(BaseModel):
    """표준 단가는 system_settings.finops_pricing (PostgreSQL SSOT) 에서 온다."""
    currency: str = "KRW"
    standard_input_per_1k: float = 0.80
    standard_output_per_1k: float = 2.40
    standard_cache_discount: float = 0.25
    models: List[ModelPricingInfo] = []

class PricingUpdateRequest(BaseModel):
    currency: Optional[str] = None
    input_per_1k: Optional[float] = Field(None, ge=0)
    output_per_1k: Optional[float] = Field(None, ge=0)
    cache_discount_ratio: Optional[float] = Field(None, ge=0, le=1)

class ReconcileResponse(BaseModel):
    month: Optional[str] = None
    total_drift_krw: float = 0.0
    drifted_tenant_count: int = 0
    applied: bool = False
    details: List[dict] = []
    error: Optional[str] = None

class TenantFinOpsSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    tenant_id: str
    tenant_name: str
    department_code: str
    monthly_budget_krw: float
    spent_budget_krw: float
    remaining_budget_krw: float
    burn_rate_pct: float
    is_hard_cap_enabled: bool
    is_blocked: bool
    is_soft_cap_reached: bool = False
    total_tokens: int
    cached_spent_krw: float = Field(0.0, description="캐시 컬럼 값 (원장과 다르면 드리프트)")
    drift_krw: float = Field(0.0, description="캐시 - 원장 차액")

class FinOpsOverviewResponse(BaseModel):
    total_budget_krw: float
    total_spent_krw: float
    total_remaining_krw: float
    overall_burn_rate_pct: float
    projected_month_end_krw: float
    active_tenants_count: int
    billing_month: str = Field("", description="집계 기준 회계 결산월 (YYYY-MM)")
    soft_cap_threshold_pct: float = Field(80.0, description="소프트캡 경보 임계치")
    cache_drift_krw: float = Field(0.0, description="캐시와 원장의 총 차액 (0이 정상)")
    unattributed_spent_krw: float = Field(
        0.0,
        description="현존 테넌트에 귀속되지 않은 지출 (global/삭제된 테넌트). total_spent_krw 에 포함됨",
    )
    semantic_cache_saved_krw: float = Field(0.0, description="결산월 누적 시맨틱 캐시 절감액 (원장 영속)")
    pricing_matrix: FinOpsPricingMatrix
    tenants: List[TenantFinOpsSummary]
    generated_at: datetime = Field(default_factory=get_utc_now)
