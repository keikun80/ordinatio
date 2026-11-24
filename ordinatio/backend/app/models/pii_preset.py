"""PII Simulation Preset ORM Model — Phase 4: Compliance & Forensics"""
from sqlalchemy import Column, String, Text, DateTime, func
from app.db.base import Base


class PiiPreset(Base):
    __tablename__ = "pii_presets"

    preset_id = Column(String(64), primary_key=True)
    label = Column(String(128), nullable=False)
    text = Column(Text, nullable=False)
    created_by = Column(String(64), nullable=False, default="admin")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
