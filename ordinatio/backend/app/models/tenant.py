from sqlalchemy import Column, String, Boolean, Numeric, DateTime, func
from sqlalchemy.orm import relationship
from app.db.base import Base

class Tenant(Base):
    __tablename__ = "tenants"

    tenant_id = Column(String(64), primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    department_code = Column(String(32), unique=True, nullable=False)
    monthly_budget_krw = Column(Numeric(15, 2), default=0.00, nullable=False)
    # 당월 지출 '읽기 캐시'. SSOT 는 DailyTokenLedger 이며 언제든 재구축 가능하다.
    # spent_period_month 와 짝으로 해석해야 한다 — 저장된 월이 당월이 아니면 그 값은
    # 지난 달 잔재이므로 0 으로 취급한다(app.core.metering.tenant_effective_spend).
    # 이 설계로 월 경계가 첫 쓰기 시 자기 치유되어 월간 리셋 크론이 필요 없고,
    # Hard Cap 이 달이 바뀌어도 영구 차단으로 남지 않는다.
    spent_budget_krw = Column(Numeric(15, 2), default=0.00, nullable=False)
    spent_period_month = Column(String(7), nullable=True)  # 'YYYY-MM'
    is_hard_cap_enabled = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    virtual_keys = relationship("VirtualKey", back_populates="tenant")
