"""Compliance & PII Governance API Endpoints — Phase 4

- PII Masking Rule Management (CRUD)
- Real-time PII Simulation & Masking
- WORM-Compliant Immutable Audit Log Query & Filtering
- Compliance Dashboard Metrics & Statistics
"""
import json
import re
import uuid
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from app.db.session import get_db
from app.models.pii_rule import PiiRule
from app.models.audit_log import AuditLog
from app.models.pii_preset import PiiPreset
from app.core.pii_engine import PiiEngine, PiiEngineError, PiiBlockedError
from app.core.worm_storage import WormStorage
from app.schemas.compliance import (
    PiiRuleRead,
    PiiRuleCreate,
    PiiRuleUpdate,
    SimulateRequest,
    SimulateResponse,
    PiiDetectionOut,
    AuditLogRead,
    ComplianceStats,
    PiiPresetRead,
    PiiPresetCreate,
)
from app.api.deps import require_permission

router = APIRouter(prefix="/compliance", tags=["PII Compliance & Audit Forensics"])


def _load_engine(db: Session) -> PiiEngine:
    """DB에 저장된 활성 룰셋으로 PII 엔진 인스턴스를 생성/초기화합니다."""
    engine = PiiEngine()
    engine.load_rules_from_db(db)
    return engine


# ==========================================
# 1. PII Rules Management
# ==========================================

@router.get("/rules", response_model=List[PiiRuleRead], dependencies=[Depends(require_permission("compliance:read"))])
def list_pii_rules(
    active_only: bool = Query(False, description="활성화된 룰만 조회"),
    db: Session = Depends(get_db)
):
    """모든 PII 탐지/마스킹 규칙 목록을 조회합니다."""
    query = db.query(PiiRule)
    if active_only:
        query = query.filter(PiiRule.is_active == True)
    rules = query.order_by(PiiRule.rule_id.asc()).all()
    return rules


@router.get("/rule-templates", dependencies=[Depends(require_permission("compliance:read"))])
def get_rule_templates(db: Session = Depends(get_db)):
    """DB pii_rules 테이블 기반 정규식 템플릿 맵을 반환합니다. (SSOT)"""
    rules = db.query(PiiRule).filter(PiiRule.is_active == True).all()
    templates = {}
    for r in rules:
        if r.entity_type not in templates:
            templates[r.entity_type] = r.regex_pattern
    return templates


@router.post("/rules", response_model=PiiRuleRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("compliance:write"))])
def create_pii_rule(payload: PiiRuleCreate, db: Session = Depends(get_db)):
    """신규 PII 마스킹 규칙을 등록합니다."""
    # 1. 중복 ID 검사
    existing = db.query(PiiRule).filter(PiiRule.rule_id == payload.rule_id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"이미 등록된 Rule ID입니다: {payload.rule_id}"
        )

    # 2. 정규식 문법 유효성 검사
    try:
        re.compile(payload.regex_pattern)
    except re.error as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"정규식 문법 오류: {str(e)}"
        )

    # 3. DB 저장
    rule = PiiRule(
        rule_id=payload.rule_id,
        name=payload.name,
        entity_type=payload.entity_type,
        regex_pattern=payload.regex_pattern,
        confidence_threshold=payload.confidence_threshold,
        action=payload.action,
        is_active=payload.is_active,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.put("/rules/{rule_id}", response_model=PiiRuleRead, dependencies=[Depends(require_permission("compliance:write"))])
def update_pii_rule(rule_id: str, payload: PiiRuleUpdate, db: Session = Depends(get_db)):
    """기존 PII 규칙을 수정합니다."""
    rule = db.query(PiiRule).filter(PiiRule.rule_id == rule_id).first()
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"해당 Rule ID를 찾을 수 없습니다: {rule_id}"
        )

    # 정규식 패턴 수정 시 검증
    if payload.regex_pattern is not None:
        try:
            re.compile(payload.regex_pattern)
            rule.regex_pattern = payload.regex_pattern
        except re.error as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"정규식 문법 오류: {str(e)}"
            )

    if payload.name is not None:
        rule.name = payload.name
    if payload.confidence_threshold is not None:
        rule.confidence_threshold = payload.confidence_threshold
    if payload.action is not None:
        rule.action = payload.action
    if payload.is_active is not None:
        rule.is_active = payload.is_active

    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}", status_code=status.HTTP_200_OK, dependencies=[Depends(require_permission("compliance:write"))])
def delete_pii_rule(rule_id: str, db: Session = Depends(get_db)):
    """PII 규칙을 삭제합니다."""
    rule = db.query(PiiRule).filter(PiiRule.rule_id == rule_id).first()
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"해당 Rule ID를 찾을 수 없습니다: {rule_id}"
        )

    db.delete(rule)
    db.commit()
    return {"message": f"Rule {rule_id} has been deleted successfully."}


# ==========================================
# 2. PII Simulation & Masking
# ==========================================

@router.post("/simulate", response_model=SimulateResponse, dependencies=[Depends(require_permission("compliance:read"))])
def simulate_pii_masking(payload: SimulateRequest, db: Session = Depends(get_db)):
    """입력 프롬프트에 대해 PII 탐지 및 마스킹을 시뮬레이션하고, 
    WORM 감사 로그를 DB에 기록합니다.
    """
    engine = _load_engine(db)

    # 마스킹 실행
    masking_result = engine.mask(payload.text)

    # WORM 감사 로그 생성 및 불변 저장 (INSERT-only)
    log_id = f"aud-{uuid.uuid4().hex[:12]}"
    action_taken = "BLOCK" if masking_result.is_blocked else ("MASK" if masking_result.pii_count > 0 else "PASS")

    # 탐지 목록 직렬화 (보안상 원문은 제외하고 마스킹된 결과와 타입만 보관)
    detections_summary = [
        {
            "entity_type": d.entity_type,
            "rule_id": d.rule_id,
            "rule_name": d.rule_name,
            "confidence": d.confidence,
            "action": d.action,
            "replacement": d.replacement,
        }
        for d in masking_result.detections
    ]

    worm_ref = WormStorage.record_audit_log(
        log_id=log_id,
        requester_id=payload.requester_id,
        key_id=payload.key_id,
        model_id=payload.model_id,
        original_prompt_hash=masking_result.original_hash,
        masked_payload_hash=masking_result.masked_hash,
        detections=detections_summary,
        pii_count=masking_result.pii_count,
        action_taken=action_taken,
        latency_ms=masking_result.latency_ms,
        is_blocked=masking_result.is_blocked,
    )

    audit_entry = AuditLog(
        log_id=log_id,
        requester_id=payload.requester_id,
        key_id=payload.key_id,
        model_id=payload.model_id,
        original_prompt_hash=masking_result.original_hash,
        masked_payload_hash=masking_result.masked_hash,
        detections_json=json.dumps(detections_summary, ensure_ascii=False),
        pii_count=masking_result.pii_count,
        action_taken=action_taken,
        latency_ms=masking_result.latency_ms,
        is_blocked=masking_result.is_blocked,
        worm_reference_id=worm_ref,
    )
    db.add(audit_entry)
    db.commit()

    detection_outs = [
        PiiDetectionOut(
            entity_type=d.entity_type,
            rule_id=d.rule_id,
            rule_name=d.rule_name,
            matched_text=d.matched_text,
            confidence=d.confidence,
            action=d.action,
            replacement=d.replacement,
        )
        for d in masking_result.detections
    ]

    return SimulateResponse(
        original_text=masking_result.original_text,
        masked_text=masking_result.masked_text,
        detections=detection_outs,
        is_blocked=masking_result.is_blocked,
        latency_ms=masking_result.latency_ms,
        original_hash=masking_result.original_hash,
        masked_hash=masking_result.masked_hash,
        pii_count=masking_result.pii_count,
        audit_log_id=log_id,
    )


# ==========================================
# 3. WORM Audit Logs Forensics
# ==========================================

@router.get("/audit-logs", response_model=List[AuditLogRead], dependencies=[Depends(require_permission("compliance:read"))])
def list_audit_logs(
    requester_id: Optional[str] = Query(None, description="요청자 ID 필터"),
    key_id: Optional[str] = Query(None, description="가상 API Key ID 필터"),
    action_taken: Optional[str] = Query(None, description="조치 필터 (PASS, MASK, BLOCK)"),
    is_blocked: Optional[bool] = Query(None, description="차단 여부 필터"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """WORM 감사 로그 목록을 최신순으로 조회합니다. (INSERT-only 불변 보장)"""
    query = db.query(AuditLog)

    if requester_id:
        query = query.filter(AuditLog.requester_id.ilike(f"%{requester_id}%"))
    if key_id:
        query = query.filter(AuditLog.key_id == key_id)
    if action_taken:
        query = query.filter(AuditLog.action_taken == action_taken.upper())
    if is_blocked is not None:
        query = query.filter(AuditLog.is_blocked == is_blocked)

    logs = query.order_by(desc(AuditLog.timestamp)).offset(offset).limit(limit).all()
    return logs


# ==========================================
# 4. Compliance Statistics & Metrics
# ==========================================

@router.get("/stats", response_model=ComplianceStats, dependencies=[Depends(require_permission("compliance:read"))])
def get_compliance_stats(db: Session = Depends(get_db)):
    """컴플라이언스 대시보드 통계 지표를 반환합니다."""
    total_rules = db.query(PiiRule).count()
    active_rules = db.query(PiiRule).filter(PiiRule.is_active == True).count()
    total_audit_logs = db.query(AuditLog).count()
    total_blocked = db.query(AuditLog).filter(AuditLog.is_blocked == True).count()
    total_masked_events = db.query(AuditLog).filter(AuditLog.pii_count > 0).count()

    # 탐지 타입별 집계 (최근 1000건 감사 로그 대상)
    recent_logs = db.query(AuditLog.detections_json).order_by(desc(AuditLog.timestamp)).limit(1000).all()
    detections_by_type = {
        "RRN": 0,
        "BANK_ACCOUNT": 0,
        "CREDIT_CARD": 0,
        "EMPLOYEE_ID": 0,
        "OTHER": 0,
    }

    for (dj,) in recent_logs:
        if dj:
            try:
                items = json.loads(dj)
                for item in items:
                    etype = item.get("entity_type", "OTHER")
                    detections_by_type[etype] = detections_by_type.get(etype, 0) + 1
            except Exception:
                pass

    return ComplianceStats(
        total_rules=total_rules,
        active_rules=active_rules,
        total_audit_logs=total_audit_logs,
        total_blocked=total_blocked,
        total_masked_events=total_masked_events,
        detections_by_type=detections_by_type,
    )


# ==========================================
# 5. WORM Storage & Merkle Hash Integrity Verification
# ==========================================

@router.get("/worm/verify", dependencies=[Depends(require_permission("compliance:read"))])
def verify_worm_audit_chain():
    """WORM 불변 스토리지 및 SHA-256 머클 해시 체인 무결성을 실시간 전수 검증합니다."""
    return WormStorage.verify_integrity()


@router.get("/audit-logs/export", dependencies=[Depends(require_permission("compliance:read"))])
def export_audit_logs(
    requester_id: Optional[str] = Query(None, description="요청자 ID 필터"),
    action_taken: Optional[str] = Query(None, description="조치 필터"),
    is_blocked: Optional[bool] = Query(None, description="차단 여부 필터"),
    limit: int = Query(1000, ge=1, le=5000),
    db: Session = Depends(get_db)
):
    """WORM 감사 로그를 포렌식 JSON 형식으로 스트리밍 내보내기합니다."""
    from fastapi.responses import JSONResponse
    query = db.query(AuditLog)
    if requester_id:
        query = query.filter(AuditLog.requester_id.ilike(f"%{requester_id}%"))
    if action_taken:
        query = query.filter(AuditLog.action_taken == action_taken.upper())
    if is_blocked is not None:
        query = query.filter(AuditLog.is_blocked == is_blocked)

    def _parse_detections(val):
        if not val:
            return []
        try:
            return json.loads(val)
        except Exception:
            import ast
            try:
                return ast.literal_eval(val)
            except Exception:
                return []

    logs = query.order_by(desc(AuditLog.timestamp)).limit(limit).all()
    export_data = [
        {
            "log_id": l.log_id,
            "timestamp": l.timestamp.isoformat() if l.timestamp else None,
            "requester_id": l.requester_id,
            "key_id": l.key_id,
            "model_id": l.model_id,
            "original_prompt_hash": l.original_prompt_hash,
            "masked_payload_hash": l.masked_payload_hash,
            "pii_count": l.pii_count,
            "action_taken": l.action_taken,
            "latency_ms": float(l.latency_ms or 0),
            "is_blocked": l.is_blocked,
            "worm_reference_id": l.worm_reference_id,
            "detections": _parse_detections(l.detections_json)
        }
        for l in logs
    ]
    filename = f"ordinatio_worm_forensics_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    return JSONResponse(
        content=export_data,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# ==========================================
# 6. PII Presets Management (Database-backed)
# ==========================================

DEFAULT_PRESETS = [
    {
        "preset_id": "preset-rrn-sample",
        "label": "주민등록번호 포함 대출 심사 요청",
        "text": "홍길동 고객님의 신용대출 승인을 요청합니다. 주민등록번호는 880101-1234567 이며, 서울시 영등포구 여의도동 거주 중입니다.",
        "created_by": "system"
    },
    {
        "preset_id": "preset-bank-sample",
        "label": "계좌번호 및 급여 이체 문의",
        "text": "국민은행 123-456-789012 계좌로 이번 달 급여 4,500,000원을 이체 요청드립니다. 예금주: 김철수",
        "created_by": "system"
    },
    {
        "preset_id": "preset-card-sample",
        "label": "신용카드 번호 결제 승인 요청",
        "text": "기업카드 9410-1234-5678-9012 로 서버 인프라 비용 $1,250 결제 진행해 주세요.",
        "created_by": "system"
    },
    {
        "preset_id": "preset-emp-sample",
        "label": "사번 포함 개발팀 계정 권한 신청 (BLOCK 대상)",
        "text": "개발1팀 사번 EMP-2024-0012 직원의 프로덕션 DB 읽기 권한 상향을 요청합니다.",
        "created_by": "system"
    }
]

@router.get("/presets", response_model=List[PiiPresetRead], dependencies=[Depends(require_permission("compliance:read"))])
def list_pii_presets(db: Session = Depends(get_db)):
    """PII 검사 시뮬레이션 샘플 프리셋 목록을 조회합니다 (DB 미존재 시 기본 프리셋 시딩)."""
    presets = db.query(PiiPreset).order_by(PiiPreset.created_at.asc()).all()
    if not presets:
        for p_def in DEFAULT_PRESETS:
            preset = PiiPreset(
                preset_id=p_def["preset_id"],
                label=p_def["label"],
                text=p_def["text"],
                created_by=p_def["created_by"]
            )
            db.add(preset)
        db.commit()
        presets = db.query(PiiPreset).order_by(PiiPreset.created_at.asc()).all()
    return presets


@router.post("/presets", response_model=PiiPresetRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("compliance:write"))])
def create_pii_preset(payload: PiiPresetCreate, db: Session = Depends(get_db)):
    """신규 PII 검사 시뮬레이션 프리셋을 등록합니다."""
    preset_id = f"preset-{uuid.uuid4().hex[:8]}"
    new_preset = PiiPreset(
        preset_id=preset_id,
        label=payload.label.strip(),
        text=payload.text.strip(),
        created_by=payload.created_by or "admin"
    )
    db.add(new_preset)
    db.commit()
    db.refresh(new_preset)
    return new_preset


@router.delete("/presets/{preset_id}", status_code=status.HTTP_200_OK, dependencies=[Depends(require_permission("compliance:write"))])
def delete_pii_preset(preset_id: str, db: Session = Depends(get_db)):
    """PII 시뮬레이션 프리셋을 삭제합니다."""
    preset = db.query(PiiPreset).filter(PiiPreset.preset_id == preset_id).first()
    if not preset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"프리셋 '{preset_id}'을(를) 찾을 수 없습니다."
        )
    db.delete(preset)
    db.commit()
    return {"status": "success", "message": f"Preset '{preset_id}' deleted successfully."}


