from sqlalchemy import Column, String, JSON, DateTime, Boolean, func
from app.db.base import Base

class AgentRouterPolicyModel(Base):
    __tablename__ = "agent_router_policies"

    policy_id = Column(String(64), primary_key=True, index=True)  # QualityFirst, LeastCost, LatencyOptimized, SelfHealingFallback
    name = Column(String(128), nullable=False)
    description = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    config = Column(JSON, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
