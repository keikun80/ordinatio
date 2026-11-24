from typing import Any, Optional, Dict, List
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime

class SystemSettingBase(BaseModel):
    category: str = Field(default="general", description="설정 카테고리 (router, providers, prompts, cache 등)")
    description: Optional[str] = Field(None, description="설정 항목 설명")
    value: Any = Field(..., description="설정 값 (JSON/Dict/List/Primitive)")

class SystemSettingCreate(SystemSettingBase):
    key: str = Field(..., description="고유 설정 식별자 키")

class SystemSettingUpdate(BaseModel):
    category: Optional[str] = None
    description: Optional[str] = None
    value: Any

class SystemSettingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    category: str
    description: Optional[str]
    value: Any
    updated_at: Optional[datetime] = None
