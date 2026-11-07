import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, JSON
from app.db.base import Base

def get_utc_now():
    return datetime.now(timezone.utc)

class Role(Base):
    __tablename__ = "roles"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(64), unique=True, nullable=False, index=True)
    display_name = Column(String(128), nullable=False)
    description = Column(String(512), nullable=True)
    is_system = Column(Boolean, nullable=False, default=False)
    permissions = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now, nullable=False)

