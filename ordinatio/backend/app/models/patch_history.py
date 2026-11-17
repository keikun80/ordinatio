from sqlalchemy import Column, String, Boolean, DateTime, Text, func
from app.db.base import Base

class PatchHistory(Base):
    __tablename__ = "patch_history"

    patch_id = Column(String(64), primary_key=True, index=True)
    package_name = Column(String(255), nullable=False)
    target_component = Column(String(64), nullable=False)  # ext_proc, envoy, control_plane, presidio
    previous_version = Column(String(32), nullable=False)
    applied_version = Column(String(32), nullable=False)
    signature_verified = Column(Boolean, default=False, nullable=False)
    status = Column(String(32), nullable=False, default="APPLIED")  # APPLIED, ROLLED_BACK, FAILED, DRY_RUN_PASSED
    applied_by = Column(String(64), nullable=False, default="sysadmin-ops")
    applied_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    details_json = Column(Text, nullable=True)  # Deployment logs, verification details in JSON
