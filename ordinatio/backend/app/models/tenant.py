from sqlalchemy import Column, String, Boolean, Numeric, DateTime, func
from sqlalchemy.orm import relationship
from app.db.base import Base

class Tenant(Base):
    __tablename__ = "tenants"

    tenant_id = Column(String(64), primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    department_code = Column(String(32), unique=True, nullable=False)
    monthly_budget_krw = Column(Numeric(15, 2), default=0.00, nullable=False)
    spent_budget_krw = Column(Numeric(15, 2), default=0.00, nullable=False)
    is_hard_cap_enabled = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    virtual_keys = relationship("VirtualKey", back_populates="tenant")
