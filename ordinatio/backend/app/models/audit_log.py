"""Audit Log ORM Model — Phase 4: WORM Compliance Forensics

INSERT-only 불변 감사 로그. UPDATE/DELETE 금지 정책 적용.
프로덕션 환경에서는 S3 Object Lock(WORM) 연동으로 불변성 보장.
"""
from sqlalchemy import Column, String, Text, Integer, Numeric, DateTime, Boolean
from sqlalchemy.sql import func
from app.db.base import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    log_id = Column(String(64), primary_key=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    requester_id = Column(String(64), nullable=False)  # 사번 또는 시스템 ID
    key_id = Column(String(64), nullable=True)  # 가상 API Key ID
    model_id = Column(String(128), nullable=True)  # 요청 대상 모델
    original_prompt_hash = Column(String(128), nullable=False)  # SHA-256 (원문 미저장)
    masked_payload_hash = Column(String(128), nullable=False)  # 마스킹 후 페이로드 SHA-256
    detections_json = Column(Text, nullable=False, default="[]")  # JSON: 탐지된 PII 목록
    pii_count = Column(Integer, nullable=False, default=0)
    action_taken = Column(String(32), nullable=False, default="PASS")  # PASS, MASK, BLOCK
    latency_ms = Column(Numeric(10, 3), nullable=False, default=0)
    is_blocked = Column(Boolean, nullable=False, default=False)
    worm_reference_id = Column(String(128), nullable=True)  # S3 Object Lock 참조 ID
