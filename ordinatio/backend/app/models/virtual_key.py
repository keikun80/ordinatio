from sqlalchemy import Column, String, Boolean, Integer, Numeric, DateTime, ForeignKey, JSON, func
from sqlalchemy.orm import relationship
from app.db.base import Base

class VirtualKey(Base):
    __tablename__ = "virtual_keys"

    key_id = Column(String(64), primary_key=True, index=True)
    key_hash = Column(String(128), unique=True, nullable=False)
    key_prefix = Column(String(16), nullable=False, index=True)
    tenant_id = Column(String(64), ForeignKey("tenants.tenant_id"), nullable=True, index=True)
    name = Column(String(128), nullable=False)
    allowed_models = Column(JSON, default=list, nullable=False)
    allowed_ip_cidrs = Column(JSON, default=list, nullable=False)
    rpm_limit = Column(Integer, default=120, nullable=False)
    tpm_limit = Column(Integer, default=200000, nullable=False)
    spent_krw = Column(Numeric(15, 2), default=0.00, nullable=False)
    total_tokens = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    revoked_reason = Column(String, nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    tenant = relationship("Tenant", back_populates="virtual_keys")
