"""Daily Token Ledger ORM Model — FinOps & Observability Telemetry.

Stores aggregated token usage and cost per date, tenant, and model.
Provides persistent audit trail and fast aggregation for today's cumulative tokens.
"""
from decimal import Decimal
from sqlalchemy import Column, String, Date, Integer, BigInteger, Numeric, DateTime
from sqlalchemy.sql import func
from app.db.base import Base


class DailyTokenLedger(Base):
    __tablename__ = "daily_token_ledger"

    date = Column(Date, primary_key=True, nullable=False)
    tenant_id = Column(String(64), primary_key=True, nullable=False, default="global")
    model_id = Column(String(128), primary_key=True, nullable=False, default="default")
    prompt_tokens = Column(BigInteger, nullable=False, default=0)
    completion_tokens = Column(BigInteger, nullable=False, default=0)
    total_tokens = Column(BigInteger, nullable=False, default=0)
    cost_krw = Column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    request_count = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
