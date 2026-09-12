"""PII Rule ORM Model — Phase 4: Compliance & Forensics"""
from sqlalchemy import Column, String, Text, Numeric, Boolean
from sqlalchemy.sql import func
from sqlalchemy import DateTime
from app.db.base import Base


class PiiRule(Base):
    __tablename__ = "pii_rules"

    rule_id = Column(String(64), primary_key=True)
    name = Column(String(128), nullable=False)
    entity_type = Column(String(32), nullable=False)  # RRN, BANK_ACCOUNT, CREDIT_CARD, EMPLOYEE_ID
    regex_pattern = Column(Text, nullable=False)
    confidence_threshold = Column(Numeric(3, 2), nullable=False, default=0.85)
    action = Column(String(32), nullable=False, default="MASK")  # MASK, HASH, BLOCK
    is_active = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
