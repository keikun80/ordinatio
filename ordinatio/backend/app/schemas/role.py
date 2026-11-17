from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict

class PermissionInfo(BaseModel):
    code: str
    name: str
    category: str
    description: str

class RoleBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=64, description="역할 식별 코드 (예: AUDITOR)")
    display_name: str = Field(..., min_length=2, max_length=128, description="역할 표시 명칭 (예: 보안 감사관)")
    description: Optional[str] = Field(None, max_length=512, description="역할 설명")
    permissions: List[str] = Field(default_factory=list, description="부여된 세부 권한 목록")

class RoleCreate(RoleBase):
    pass

class RoleUpdate(BaseModel):
    display_name: Optional[str] = Field(None, min_length=2, max_length=128)
    description: Optional[str] = Field(None, max_length=512)
    permissions: Optional[List[str]] = None

class RoleResponse(BaseModel):
    id: str
    name: str
    display_name: str
    description: Optional[str] = None
    is_system: bool
    permissions: List[str] = []
    user_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
