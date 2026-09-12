from sqlalchemy import Column, String, JSON, DateTime, ForeignKey, Integer, Boolean, Text, func
from app.db.base import Base

class RoutingPolicy(Base):
    __tablename__ = "routing_policies"

    policy_id = Column(String(64), primary_key=True, index=True)
    route_name = Column(String(128), unique=True, nullable=False)
    traffic_weights = Column(JSON, nullable=False)  # e.g. [{"model_id": "...", "weight": 80}]
    load_balancing_strategy = Column(String(32), default="LeastQueueDepth", nullable=False)
    failover_model_id = Column(String(128), ForeignKey("model_catalogs.model_id"), nullable=True)
    xds_revision = Column(String(64), nullable=False)
    deployed_by = Column(String(64), nullable=False, default="admin")
    deployed_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Multi-routing fields
    priority = Column(Integer, default=10, nullable=False)
    match_conditions = Column(JSON, nullable=True)
    failover_chain = Column(JSON, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    description = Column(Text, nullable=True)
