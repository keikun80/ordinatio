from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field

class TenantBase(BaseModel):
    name: str = Field(..., max_length=128, description="부서 또는 테넌트 명칭")
    department_code: str = Field(..., max_length=32, description="고유 부서 코드 (예: DEPT-01)")
    monthly_budget_krw: Decimal = Field(default=Decimal("1000000.00"), description="월간 예산 한도 (원)")
    is_hard_cap_enabled: bool = Field(default=True, description="예산 100% 초과 시 즉시 차단 여부")

class TenantCreate(TenantBase):
    tenant_id: Optional[str] = Field(None, max_length=64, description="테넌트 ID (생략 시 자동 생성)")

class TenantUpdate(BaseModel):
    name: Optional[str] = None
    monthly_budget_krw: Optional[Decimal] = None
    is_hard_cap_enabled: Optional[bool] = None

class TenantResponse(TenantBase):
    model_config = ConfigDict(from_attributes=True)

    tenant_id: str
    spent_budget_krw: Decimal = Decimal("0.00")
    active_keys_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
