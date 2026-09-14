from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field

class VirtualKeyBase(BaseModel):
    name: str = Field(..., max_length=128, description="가상 API Key 식별 명칭")
    tenant_id: str = Field(..., description="소속 테넌트(부서) ID")
    allowed_models: List[str] = Field(default_factory=list, description="접근 허용 모델 ID 목록")
    allowed_ip_cidrs: List[str] = Field(default_factory=list, description="허용 클라이언트 IP/CIDR 대역")
    rpm_limit: int = Field(default=120, ge=1, le=100000, description="분당 요청 수(RPM) 제한")
    tpm_limit: int = Field(default=200000, ge=1, le=10000000, description="분당 토큰 수(TPM) 제한")
    expires_at: Optional[datetime] = Field(None, description="만료 일시 (생략 시 영구)")

class VirtualKeyCreate(VirtualKeyBase):
    pass

class VirtualKeyUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=128, description="가상 API Key 식별 명칭")
    allowed_models: Optional[List[str]] = Field(None, description="접근 허용 모델 ID 목록")
    allowed_ip_cidrs: Optional[List[str]] = Field(None, description="허용 클라이언트 IP/CIDR 대역")
    rpm_limit: Optional[int] = Field(None, ge=1, le=100000, description="분당 요청 수(RPM) 제한")
    tpm_limit: Optional[int] = Field(None, ge=1, le=10000000, description="분당 토큰 수(TPM) 제한")
    is_active: Optional[bool] = Field(None, description="활성화 상태")
    revoked_reason: Optional[str] = Field(None, description="비활성화 사유")

class VirtualKeyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key_id: str
    name: str
    tenant_id: str
    tenant_name: Optional[str] = None
    key_prefix: str
    allowed_models: List[str] = []
    allowed_ip_cidrs: List[str] = []
    rpm_limit: int
    tpm_limit: int
    is_active: bool
    revoked_reason: Optional[str] = None
    expires_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class VirtualKeyCreateResponse(VirtualKeyResponse):
    """
    신규 발급 시 단 1회만 노출되는 평문 토큰(raw_key)을 포함하는 응답 스키마
    """
    raw_key: str = Field(..., description="32자리 보안 가상 API Key (단 1회만 제공)")
    security_notice: str = "⚠️ 이 키는 지금 1회만 표시되며 데이터베이스에 단방향 해시로 저장되므로 다시 확인할 수 없습니다. 안전한 장소에 복사하여 보관하십시오."

class VirtualKeyRevokeRequest(BaseModel):
    revoked_reason: str = Field(default="관리자에 의한 즉시 파기", description="파기/차단 사유")

class VirtualKeyDeleteResponse(BaseModel):
    key_id: str
    message: str

class VirtualKeyValidateRequest(BaseModel):
    raw_key: str = Field(..., description="검증할 가상 API Key")
    model_id: Optional[str] = Field(None, description="요청 대상 모델 ID")
    client_ip: Optional[str] = Field(None, description="요청 클라이언트 IP")

class VirtualKeyValidateResponse(BaseModel):
    valid: bool
    key_id: Optional[str] = None
    tenant_id: Optional[str] = None
    tenant_name: Optional[str] = None
    rpm_limit: Optional[int] = None
    tpm_limit: Optional[int] = None
    reason: Optional[str] = None
