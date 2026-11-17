from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict

class UserLoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=255, description="사용자 아이디 또는 이메일")
    password: str = Field(..., min_length=1, description="비밀번호")


class UserResponse(BaseModel):
    id: str
    username: str
    full_name: str
    email: str
    role: str  # SUPER_ADMIN, TENANT_ADMIN, VIEWER
    permissions: List[str] = []
    tenant_id: Optional[str] = None
    tenant_name: Optional[str] = None
    is_active: bool
    failed_login_count: int = 0
    is_locked: bool = False
    locked_until: Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = 1800  # 30분 (1800초)
    user: UserResponse


class UserCreateRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=8, description="최소 8자 이상 비밀번호")
    full_name: str = Field(..., min_length=2, max_length=128)
    email: str = Field(..., min_length=5, max_length=255, description="이메일 주소")
    role: str = Field(default="VIEWER", description="SUPER_ADMIN, TENANT_ADMIN, VIEWER")
    tenant_id: Optional[str] = None


class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    tenant_id: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None
    unlock: Optional[bool] = Field(default=None, description="계정 잠금 강제 해제 여부")


class PasswordChangeRequest(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=8)
