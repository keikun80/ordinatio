from typing import Optional, List, Literal, Any, Dict
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict

TargetType = Literal["ROUTE", "VIRTUAL_KEY", "TENANT", "GLOBAL"]
InjectionMode = Literal["PREPEND", "OVERRIDE", "FALLBACK_ONLY"]

class SystemPromptBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=128, description="프롬프트 식별 명칭")
    description: Optional[str] = Field(None, max_length=255, description="프롬프트 설명 및 목적")
    content: str = Field(..., min_length=1, description="실제 주입될 시스템 프롬프트 본문")
    target_type: TargetType = Field(..., description="바인딩 대상 유형 (ROUTE, VIRTUAL_KEY, TENANT, GLOBAL)")
    target_id: Optional[str] = Field(None, max_length=128, description="바인딩 대상 식별자 (GLOBAL일 경우 None)")
    target_name: Optional[str] = Field(None, max_length=128, description="바인딩 대상 표시 명칭")
    injection_mode: InjectionMode = Field("PREPEND", description="주입 전략 (PREPEND, OVERRIDE, FALLBACK_ONLY)")
    is_active: bool = Field(True, description="활성화 여부")

class SystemPromptCreate(SystemPromptBase):
    prompt_id: Optional[str] = Field(None, max_length=64, description="선택적 고유 ID (미입력 시 자동 생성)")

class SystemPromptUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=128)
    description: Optional[str] = Field(None, max_length=255)
    content: Optional[str] = Field(None, min_length=1)
    target_type: Optional[TargetType] = None
    target_id: Optional[str] = None
    target_name: Optional[str] = None
    injection_mode: Optional[InjectionMode] = None
    is_active: Optional[bool] = None

class SystemPromptResponse(SystemPromptBase):
    model_config = ConfigDict(from_attributes=True)

    prompt_id: str
    estimated_tokens: int
    version: int = 1
    created_at: datetime
    updated_at: datetime

class PromptResolveRequest(BaseModel):
    key_id: Optional[str] = Field(None, description="가상 API Key 식별자")
    route_name: Optional[str] = Field(None, description="호출 대상 라우트 명칭")
    tenant_id: Optional[str] = Field(None, description="호출자 소속 테넌트 ID")
    input_messages: Optional[List[Dict[str, Any]]] = Field(default_factory=list, description="클라이언트 원본 메시지 배열")

class PromptResolveResponse(BaseModel):
    matched: bool = Field(..., description="시스템 프롬프트 매칭 여부")
    resolved_by: Optional[str] = Field(None, description="매칭된 우선순위 소스 ('VIRTUAL_KEY', 'ROUTE', 'TENANT', 'GLOBAL', None)")
    matched_prompt: Optional[SystemPromptResponse] = Field(None, description="매칭된 시스템 프롬프트 정보")
    final_messages: List[Dict[str, Any]] = Field(default_factory=list, description="프롬프트 주입 후 최종 메시지 배열")
