from sqlalchemy import Column, String, Text, JSON, DateTime, func
from app.db.base import Base

class SystemSetting(Base):
    """
    Key-Value / JSON System Settings Table for Business Domain & Operation Variables.
    Acts as the Single Source of Truth (SSOT) stored in PostgreSQL.
    """
    __tablename__ = "system_settings"

    key = Column(String(64), primary_key=True, index=True)
    category = Column(String(32), nullable=False, default="general", index=True)
    description = Column(String(255), nullable=True)
    value = Column(JSON, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
