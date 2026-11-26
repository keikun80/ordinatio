from typing import Optional, List, Literal, Any, Dict
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict

TargetType = Literal["ROUTE", "VIRTUAL_KEY", "TENANT", "GLOBAL"]
InjectionMode = Literal["PREPEND", "OVERRIDE", "FALLBACK_ONLY"]
PromptCategory = Literal["SECURITY", "COMPLIANCE", "PERSONA"]
ChangeKind = Literal["CREATE", "UPDATE", "ACTIVATE", "DEACTIVATE", "RESTORE"]

class SystemPromptBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=128, description="프롬프트 식별 명칭")
    description: Optional[str] = Field(None, max_length=255, description="프롬프트 설명 및 목적")
    content: str = Field(..., min_length=1, description="실제 주입될 시스템 프롬프트 본문")
    target_type: TargetType = Field(..., description="바인딩 대상 유형 (ROUTE, VIRTUAL_KEY, TENANT, GLOBAL)")
    target_id: Optional[str] = Field(None, max_length=128, description="바인딩 대상 식별자 (GLOBAL일 경우 None)")
    target_name: Optional[str] = Field(
        None,
        max_length=128,
        description="바인딩 대상 표시 명칭 (서버 파생 캐시 — 입력값은 무시되며 타겟 검증을 우회할 수 없음)"
    )
    injection_mode: InjectionMode = Field("PREPEND", description="주입 전략 (PREPEND, OVERRIDE, FALLBACK_ONLY)")
    category: Optional[PromptCategory] = Field(None, description="프롬프트 분류 (SECURITY, COMPLIANCE, PERSONA)")
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
    category: Optional[PromptCategory] = None
    is_active: Optional[bool] = None

class SystemPromptResponse(SystemPromptBase):
    model_config = ConfigDict(from_attributes=True)

    prompt_id: str
    estimated_tokens: int
    version: int = 1
    created_at: datetime
    updated_at: datetime

class SystemPromptVersionResponse(BaseModel):
    """버전 이력 1행. content 는 include_content=true 로 조회할 때만 채워진다."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    prompt_id: str
    version: int
    name: str
    description: Optional[str] = None
    content: Optional[str] = None
    target_type: str
    target_id: Optional[str] = None
    target_name: Optional[str] = None
    injection_mode: str
    category: Optional[str] = None
    estimated_tokens: int = 0
    is_active: bool = True
    content_hash: str
    change_kind: str
    change_summary: Optional[str] = None
    changed_by: str
    created_at: datetime
    is_current: bool = Field(False, description="현재 적용 중인 버전인지 여부")


class SystemPromptStatsResponse(BaseModel):
    """
    KPI 카드용 전체 집계. 서버사이드 페이지네이션 전환 후에는 현재 페이지 응답만으로
    전사 집계를 계산할 수 없으므로 별도 단일 호출로 제공한다.
    """
    total: int = Field(0, description="총 등록 프롬프트 수")
    active: int = Field(0, description="활성 프롬프트 수")
    by_target_type: Dict[str, int] = Field(
        default_factory=dict,
        description="바인딩 타겟 유형별 집계 (ROUTE, VIRTUAL_KEY, TENANT, GLOBAL)"
    )


class PromptVariableInfo(BaseModel):
    """에디터에서 안내할 동적 템플릿 변수 정의"""
    name: str = Field(..., description="변수명 (플레이스홀더는 {{name}} 형태)")
    placeholder: str = Field(..., description="본문에 입력하는 실제 플레이스홀더 문자열")
    description: str = Field(..., description="변수 설명")
    example: str = Field("", description="치환 예시 값")


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
    applied_variables: Dict[str, str] = Field(default_factory=dict, description="치환된 동적 템플릿 변수 맵")
    token_delta: int = Field(0, description="주입으로 인해 증가한 토큰 오버헤드")
