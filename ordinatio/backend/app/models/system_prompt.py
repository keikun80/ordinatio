from sqlalchemy import Column, String, Text, Boolean, Integer, DateTime, func
from app.db.base import Base

class SystemPrompt(Base):
    __tablename__ = "system_prompts"

    prompt_id = Column(String(64), primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    description = Column(String(255), nullable=True)
    content = Column(Text, nullable=False)
    target_type = Column(String(32), nullable=False, index=True)  # 'ROUTE', 'VIRTUAL_KEY', 'TENANT', 'GLOBAL'
    target_id = Column(String(128), nullable=True, index=True)    # route_name, key_id, tenant_id (GLOBAL일 경우 NULL)
    target_name = Column(String(128), nullable=True)              # UI 렌더링용 캐시 명칭
    injection_mode = Column(String(32), nullable=False, default="PREPEND")  # 'PREPEND', 'OVERRIDE', 'FALLBACK_ONLY'
    estimated_tokens = Column(Integer, default=0, nullable=False)
    version = Column(Integer, default=1, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
