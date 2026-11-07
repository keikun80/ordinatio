from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from pydantic import BaseModel, Field

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
    current_solution_version: str = "v1.2.0"

# --- Patch Verification & Dry-run Schemas ---
class PatchVerifyRequest(BaseModel):
    patch_id: Optional[str] = None
    package_name: str
    target_component: str
    version: str
    signature_b64: Optional[str] = None
    payload_sha256: Optional[str] = None
    cve_id: Optional[str] = None
    description: Optional[str] = None

class SignatureVerificationInfo(BaseModel):
    signature_valid: bool
    signer: str
    algorithm: str = "RSA-4096 / SHA-256"
    fingerprint: str
    verified_at: datetime = Field(default_factory=get_utc_now)

class PatchVerifyResponse(BaseModel):
    status: str = "VERIFIED"  # VERIFIED, UNVERIFIED, INVALID_SIGNATURE
    patch_id: str
    package_name: str
    target_component: str
    version: str
    verification: SignatureVerificationInfo
    cve_id: Optional[str] = None
    release_notes: Optional[str] = None

class PatchDryRunRequest(BaseModel):
    patch_id: str
    package_name: str
    target_component: str
    version: str

class PatchDryRunResponse(BaseModel):
    status: str = "DRY_RUN_PASSED"
    patch_id: str
    can_apply_zero_downtime: bool = True
    checks: List[Dict[str, Any]]
    logs: List[str]

# --- Patch Apply & Rollback Schemas ---
class PatchApplyRequest(BaseModel):
    patch_id: str
    package_name: Optional[str] = None
    target_component: Optional[str] = None
    version: Optional[str] = None
    applied_by: str = "admin-sysops"

class PatchApplyResponse(BaseModel):
    status: str = "APPLIED"
    patch_id: str
    target_component: str
    previous_version: str
    applied_version: str
    strategy: str = "Kubernetes RollingUpdate (PDB minAvailable: 2)"
    logs: List[str]
    applied_at: datetime = Field(default_factory=get_utc_now)

class PatchRollbackRequest(BaseModel):
    patch_id: Optional[str] = None
    target_component: str = "ext_proc"
    rollback_to_version: Optional[str] = "v1.2.0"
    reason: str = "관리자에 의한 롤백 실행"
    applied_by: str = "admin-sysops"

class PatchRollbackResponse(BaseModel):
    status: str = "ROLLED_BACK"
    target_component: str
    restored_version: str
    logs: List[str]
    rolled_back_at: datetime = Field(default_factory=get_utc_now)

class PatchHistoryRead(BaseModel):
    patch_id: str
    package_name: str
    target_component: str
    previous_version: str
    applied_version: str
    signature_verified: bool
    status: str
    applied_by: str
    applied_at: datetime
    details_json: Optional[str] = None

    model_config = {"from_attributes": True}

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
