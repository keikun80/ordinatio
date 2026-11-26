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
    # 당월 사용량 '읽기 캐시'. SSOT 는 DailyTokenLedger 이며 spent_period_month 와
    # 짝으로 해석한다(Tenant 와 동일 규칙). 두 필드를 전기간 누적으로 두면
    # /finops/reconcile 이 당월 합계로 덮어쓸 때 필드 의미가 바뀌어버린다.
    spent_krw = Column(Numeric(15, 2), default=0.00, nullable=False)
    total_tokens = Column(Integer, default=0, nullable=False)
    spent_period_month = Column(String(7), nullable=True)  # 'YYYY-MM'
    is_active = Column(Boolean, default=True, nullable=False)
    revoked_reason = Column(String, nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    tenant = relationship("Tenant", back_populates="virtual_keys")
