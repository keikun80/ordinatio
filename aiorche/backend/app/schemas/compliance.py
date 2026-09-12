"""Compliance & PII Pydantic V2 Schemas — Phase 4"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


# --- PII Rule Schemas ---

class PiiRuleRead(BaseModel):
    rule_id: str
    name: str
    entity_type: str
    regex_pattern: str
    confidence_threshold: float
    action: str  # MASK, HASH, BLOCK
    is_active: bool

    model_config = {"from_attributes": True}


class PiiRuleCreate(BaseModel):
    rule_id: str = Field(..., pattern=r"^pii-[a-z0-9-]+$", max_length=64)
    name: str = Field(..., max_length=128)
    entity_type: str = Field(..., max_length=32)
    regex_pattern: str
    confidence_threshold: float = Field(default=0.85, ge=0.0, le=1.0)
    action: str = Field(default="MASK", pattern=r"^(MASK|HASH|BLOCK)$")
    is_active: bool = True


class PiiRuleUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=128)
    regex_pattern: Optional[str] = None
    confidence_threshold: Optional[float] = Field(None, ge=0.0, le=1.0)
    action: Optional[str] = Field(None, pattern=r"^(MASK|HASH|BLOCK)$")
    is_active: Optional[bool] = None


# --- PII Simulation Schemas ---

class SimulateRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)
    requester_id: str = Field(default="admin", max_length=64)
    key_id: Optional[str] = None
    model_id: Optional[str] = None


class PiiDetectionOut(BaseModel):
    entity_type: str
    rule_id: str
    rule_name: str
    matched_text: str
    confidence: float
    action: str
    replacement: str


class SimulateResponse(BaseModel):
    original_text: str
    masked_text: str
    detections: List[PiiDetectionOut]
    is_blocked: bool
    latency_ms: float
    original_hash: str
    masked_hash: str
    pii_count: int
    audit_log_id: Optional[str] = None


# --- Audit Log Schemas ---

class AuditLogRead(BaseModel):
    log_id: str
    timestamp: datetime
    requester_id: str
    key_id: Optional[str] = None
    model_id: Optional[str] = None
    original_prompt_hash: Optional[str] = None
    masked_payload_hash: Optional[str] = None
    pii_count: int
    action_taken: str
    is_blocked: bool
    latency_ms: float
    worm_reference_id: Optional[str] = None
    detections_json: str  # JSON string

    model_config = {"from_attributes": True}


class AuditLogFilter(BaseModel):
    requester_id: Optional[str] = None
    key_id: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    action_taken: Optional[str] = None
    is_blocked: Optional[bool] = None
    limit: int = Field(default=50, ge=1, le=500)
    offset: int = Field(default=0, ge=0)


class ComplianceStats(BaseModel):
    total_rules: int
    active_rules: int
    total_audit_logs: int
    total_blocked: int
    total_masked_events: int
    detections_by_type: dict
