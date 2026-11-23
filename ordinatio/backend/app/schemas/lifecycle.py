from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from app.core.config import settings

def get_utc_now() -> datetime:
    return datetime.now(timezone.utc)

# --- Component Schemas ---
class ComponentVersionInfo(BaseModel):
    name: str
    version: str
    target_patch_version: Optional[str] = None
    status: str
    description: str

class ComponentListResponse(BaseModel):
    components: List[ComponentVersionInfo]
    current_solution_version: str = f"v{settings.VERSION}"

# --- Pre-flight Diagnostics Schemas ---
class DiagnosticCheckItem(BaseModel):
    component: str
    status: str  # OK, WARN, FAIL
    latency: str
    message: str

class PreflightResponse(BaseModel):
    status: str = "HEALTHY"
    timestamp: datetime = Field(default_factory=get_utc_now)
    overall_health: str = "100% 정상 (All 5 components operational)"
    checks: Dict[str, DiagnosticCheckItem]

# --- Zero-PII Support Bundle Schemas ---
class SupportBundleRequest(BaseModel):
    include_diagnostics: bool = True
    include_system_metrics: bool = True
    include_routing_dump: bool = True
    requester_id: str = "admin-sysops"

class SupportBundleResponse(BaseModel):
    status: str = "READY"
    bundle_id: str
    bundle_filename: str
    generated_at: datetime = Field(default_factory=get_utc_now)
    sanitization_report: Dict[str, Any]
    download_url: str
    file_size_bytes: int
