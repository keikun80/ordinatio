from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field

# --- 1. Gateway Usage Telemetry Schemas ---
class UsageReportRequest(BaseModel):
    """
    Envoy L7 게이트웨이가 추론 완료 시 호출 토큰 수 및 지연시간을 보고하는 스키마
    """
    key_id: Optional[str] = Field(None, description="가상 Key ID (vk-xxx)")
    raw_key: Optional[str] = Field(None, description="또는 원문 가상 API Key (sk-ord-...)")
    model_id: str = Field(default="meta-llama/Llama-3.1-8B-Instruct", description="추론 모델 ID")
    prompt_tokens: int = Field(default=0, ge=0, description="입력 프롬프트 토큰 수")
    completion_tokens: int = Field(default=0, ge=0, description="생성 완료 토큰 수")
    latency_ms: float = Field(default=0.0, ge=0.0, description="추론 왕복 지연시간 (ms)")
    status_code: int = Field(default=200, description="업스트림 응답 상태 코드")

class UsageReportResponse(BaseModel):
    success: bool
    key_id: str
    tenant_id: str
    added_tokens: int
    added_cost_krw: Decimal
    key_total_spent_krw: Decimal
    tenant_total_spent_krw: Decimal
    tenant_monthly_budget_krw: Decimal
    tenant_usage_percent: float
    is_hard_cap_reached: bool

# --- 2. AI Client Self-Inspection Schemas ---
class ClientKeyInfoResponse(BaseModel):
    """
    사내 챗봇/에이전트 클라이언트가 본인 키 및 잔여 쿼터를 자가 조회하는 응답 스키마
    """
    key_id: str
    name: str
    tenant_id: str
    tenant_name: str
    allowed_models: List[str]
    rpm_limit: int
    tpm_limit: int
    is_active: bool
    spent_krw: Decimal
    tenant_budget_krw: Decimal
    tenant_spent_krw: Decimal
    budget_usage_percent: float
    is_hard_cap_enabled: bool

class ClientModelResponse(BaseModel):
    model_id: str
    alias: str
    backend_infra: str
    input_price_per_1k: float
    output_price_per_1k: float

# --- 3. ERP / FinOps Management Schemas ---
class TenantBudgetUpdate(BaseModel):
    """
    사내 ERP/결재 시스템에서 부서 예산을 증액/감액하거나 하드캡을 설정하는 스키마
    """
    monthly_budget_krw: Optional[Decimal] = Field(None, ge=0, description="월간 예산 한도 (원)")
    is_hard_cap_enabled: Optional[bool] = Field(None, description="100% 도달 시 즉시 차단 여부")

class TenantSummaryResponse(BaseModel):
    tenant_id: str
    name: str
    department_code: str
    monthly_budget_krw: Decimal
    spent_budget_krw: Decimal
    usage_percent: float
    is_hard_cap_enabled: bool
    active_keys_count: int
    total_tokens: int
