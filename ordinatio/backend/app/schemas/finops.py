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
    currency: str = "KRW"
    standard_input_per_1k: float = 0.80
    standard_output_per_1k: float = 2.40
    standard_cache_discount: float = 0.25
    models: List[ModelPricingInfo] = []

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
    total_tokens: int

class FinOpsOverviewResponse(BaseModel):
    total_budget_krw: float
    total_spent_krw: float
    total_remaining_krw: float
    overall_burn_rate_pct: float
    projected_month_end_krw: float
    active_tenants_count: int
    pricing_matrix: FinOpsPricingMatrix
    tenants: List[TenantFinOpsSummary]
    generated_at: datetime = Field(default_factory=get_utc_now)
