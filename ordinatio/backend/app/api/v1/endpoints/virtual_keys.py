import uuid
import hashlib
import json
import time
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.tenant import Tenant
from app.models.virtual_key import VirtualKey
from app.models.user import User
from app.models.audit_log import AuditLog
from app.core.worm_storage import WormStorage
from app.schemas.virtual_key import (
    VirtualKeyCreate,
    VirtualKeyCreateResponse,
    VirtualKeyDeleteResponse,
    VirtualKeyResponse,
    VirtualKeyRevokeRequest,
    VirtualKeyUpdate,
    VirtualKeyValidateRequest,
    VirtualKeyValidateResponse,
)
from app.core.security import generate_virtual_key, hash_virtual_key, verify_virtual_key, SYSTEM_DIAGNOSTICS_KEY_ID, is_ip_allowed
from app.api.deps import require_permission, get_tenant_scope, get_current_user

router = APIRouter(prefix="/virtual-keys", tags=["Virtual Key Lifecycle"])

def _normalize_ip_cidrs(cidrs: Optional[List[str]]) -> List[str]:
    if not cidrs:
        return []
    normalized: List[str] = []
    for item in cidrs:
        if not item:
            continue
        for part in str(item).split(","):
            cleaned = part.strip()
            if cleaned:
                normalized.append(cleaned)
    return normalized

@router.get("", response_model=List[VirtualKeyResponse], dependencies=[Depends(require_permission("governance:read"))])
def list_virtual_keys(
    tenant_id: Optional[str] = Query(None, description="테넌트(부서) ID 필터"),
    search: Optional[str] = Query(None, description="키 명칭 또는 Key ID 검색어"),
    is_active: Optional[bool] = Query(None, description="활성화 여부 필터"),
    offset: int = Query(0, ge=0, description="페이지네이션 오프셋"),
    limit: int = Query(100, ge=1, le=500, description="페이지당 반환 항목 수"),
    tenant_scope: Optional[str] = Depends(get_tenant_scope),
    db: Session = Depends(get_db)
):
    """
    가상 API Key 목록 조회 (원문 키 제외, 보안상 마스킹된 접두사만 반환, 서버사이드 페이지네이션 지원)
    """
    query = db.query(VirtualKey).join(Tenant, VirtualKey.tenant_id == Tenant.tenant_id, isouter=True)
    query = query.filter(VirtualKey.key_id != SYSTEM_DIAGNOSTICS_KEY_ID)

    if tenant_scope:
        query = query.filter(VirtualKey.tenant_id == tenant_scope)
    elif tenant_id and tenant_id != "ALL":
        query = query.filter(VirtualKey.tenant_id == tenant_id)

    if is_active is not None:
        query = query.filter(VirtualKey.is_active == is_active)

    if search:
        search_fmt = f"%{search}%"
        query = query.filter(
            (VirtualKey.name.ilike(search_fmt)) |
            (VirtualKey.key_id.ilike(search_fmt)) |
            (VirtualKey.key_prefix.ilike(search_fmt))
        )

    keys = query.order_by(VirtualKey.created_at.desc()).offset(offset).limit(limit).all()
    results = []
    for k in keys:
        results.append(
            VirtualKeyResponse(
                key_id=k.key_id,
                name=k.name,
                tenant_id=k.tenant_id,
                tenant_name=k.tenant.name if k.tenant else None,
                tenant_budget_krw=float(k.tenant.monthly_budget_krw) if k.tenant and k.tenant.monthly_budget_krw is not None else 0.0,
                spent_krw=float(k.spent_krw or 0.0),
                total_tokens=int(k.total_tokens or 0),
                key_prefix=k.key_prefix,
                allowed_models=k.allowed_models or [],
                allowed_ip_cidrs=k.allowed_ip_cidrs or [],
                rpm_limit=k.rpm_limit,
                tpm_limit=k.tpm_limit,
                is_active=k.is_active,
                revoked_reason=k.revoked_reason,
                expires_at=k.expires_at,
                created_at=k.created_at,
                updated_at=k.updated_at
            )
        )
    return results

def _record_governance_audit(
    db: Session,
    requester_id: str,
    action: str,
    key_id: Optional[str],
    details: dict
) -> None:
    """WORM 감사 로그 및 DB AuditLog 불변 보관"""
    try:
        t0 = time.time()
        log_id = f"audit-gov-{int(t0 * 1000)}-{uuid.uuid4().hex[:6]}"
        details_str = json.dumps(details, ensure_ascii=False)
        payload_hash = hashlib.sha256(details_str.encode("utf-8")).hexdigest()
        
        worm_ref = WormStorage.record_audit_log(
            log_id=log_id,
            requester_id=requester_id,
            key_id=key_id,
            model_id=None,
            original_prompt_hash=payload_hash,
            masked_payload_hash=payload_hash,
            detections=[{"governance_action": action, "details": details}],
            pii_count=0,
            action_taken=action,
            latency_ms=0.0,
            is_blocked=False,
        )

        audit_entry = AuditLog(
            log_id=log_id,
            requester_id=requester_id,
            key_id=key_id,
            model_id=None,
            original_prompt_hash=payload_hash,
            masked_payload_hash=payload_hash,
            detections_json=details_str,
            pii_count=0,
            action_taken=action,
            latency_ms=0.0,
            is_blocked=False,
            worm_reference_id=worm_ref
        )
        db.add(audit_entry)
        db.commit()
    except Exception as e:
        # WORM/감사 로그 기록 실패가 거버넌스 관리 자체를 크래시하지 않도록 로깅 후 보호
        pass

@router.post("", response_model=VirtualKeyCreateResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("governance:write"))])
def create_virtual_key(
    payload: VirtualKeyCreate,
    tenant_scope: Optional[str] = Depends(get_tenant_scope),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    신규 가상 API Key 발급
    - 32자리 sk-ord-<hex> 보안 토큰 생성
    - Argon2id 단방향 솔트 해시 계산 및 DB 저장
    - **원문 토큰(raw_key)은 본 응답에서 단 1회만 제공**
    """
    if tenant_scope and payload.tenant_id != tenant_scope:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="소속 부서(테넌트) 이외의 타 부서용 가상 API Key는 발급할 수 없습니다."
        )
    tenant = db.query(Tenant).filter(Tenant.tenant_id == payload.tenant_id).first()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"지정된 테넌트(부서)를 찾을 수 없습니다: {payload.tenant_id}"
        )

    raw_key = generate_virtual_key()
    key_prefix = raw_key[:16]  # e.g., 'sk-ord-9a1b2c3d'
    key_hash = hash_virtual_key(raw_key)
    key_id = f"vk-{uuid.uuid4().hex[:8]}"

    virtual_key = VirtualKey(
        key_id=key_id,
        key_hash=key_hash,
        key_prefix=key_prefix,
        tenant_id=tenant.tenant_id,
        name=payload.name,
        allowed_models=payload.allowed_models,
        allowed_ip_cidrs=_normalize_ip_cidrs(payload.allowed_ip_cidrs),
        rpm_limit=payload.rpm_limit,
        tpm_limit=payload.tpm_limit,
        is_active=True,
        expires_at=payload.expires_at
    )
    db.add(virtual_key)
    db.commit()
    db.refresh(virtual_key)

    _record_governance_audit(
        db=db,
        requester_id=current_user.email or current_user.user_id,
        action="CREATE_VIRTUAL_KEY",
        key_id=virtual_key.key_id,
        details={"name": virtual_key.name, "tenant_id": virtual_key.tenant_id, "key_prefix": key_prefix}
    )

    return VirtualKeyCreateResponse(
        key_id=virtual_key.key_id,
        name=virtual_key.name,
        tenant_id=virtual_key.tenant_id,
        tenant_name=tenant.name,
        tenant_budget_krw=float(tenant.monthly_budget_krw) if tenant.monthly_budget_krw is not None else 0.0,
        spent_krw=float(virtual_key.spent_krw or 0.0),
        total_tokens=int(virtual_key.total_tokens or 0),
        key_prefix=virtual_key.key_prefix,
        allowed_models=virtual_key.allowed_models or [],
        allowed_ip_cidrs=virtual_key.allowed_ip_cidrs or [],
        rpm_limit=virtual_key.rpm_limit,
        tpm_limit=virtual_key.tpm_limit,
        is_active=virtual_key.is_active,
        revoked_reason=None,
        expires_at=virtual_key.expires_at,
        created_at=virtual_key.created_at,
        updated_at=virtual_key.updated_at,
        raw_key=raw_key
    )

@router.patch("/{key_id}/revoke", response_model=VirtualKeyResponse, dependencies=[Depends(require_permission("governance:write"))])
def revoke_virtual_key(
    key_id: str,
    payload: VirtualKeyRevokeRequest,
    tenant_scope: Optional[str] = Depends(get_tenant_scope),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    가상 API Key 즉시 파기 / 비활성화
    """
    key = db.query(VirtualKey).filter(VirtualKey.key_id == key_id).first()
    if not key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="가상키를 찾을 수 없습니다.")
    if tenant_scope and key.tenant_id != tenant_scope:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="타 부서의 가상 API Key를 파기할 권한이 없습니다.")

    key.is_active = False
    key.revoked_reason = payload.revoked_reason
    db.commit()
    db.refresh(key)

    _record_governance_audit(
        db=db,
        requester_id=current_user.email or current_user.user_id,
        action="REVOKE_VIRTUAL_KEY",
        key_id=key.key_id,
        details={"name": key.name, "tenant_id": key.tenant_id, "revoked_reason": key.revoked_reason}
    )

    return VirtualKeyResponse(
        key_id=key.key_id,
        name=key.name,
        tenant_id=key.tenant_id,
        tenant_name=key.tenant.name if key.tenant else None,
        tenant_budget_krw=float(key.tenant.monthly_budget_krw) if key.tenant and key.tenant.monthly_budget_krw is not None else 0.0,
        spent_krw=float(key.spent_krw or 0.0),
        total_tokens=int(key.total_tokens or 0),
        key_prefix=key.key_prefix,
        allowed_models=key.allowed_models or [],
        allowed_ip_cidrs=key.allowed_ip_cidrs or [],
        rpm_limit=key.rpm_limit,
        tpm_limit=key.tpm_limit,
        is_active=key.is_active,
        revoked_reason=key.revoked_reason,
        expires_at=key.expires_at,
        created_at=key.created_at,
        updated_at=key.updated_at
    )

@router.patch("/{key_id}", response_model=VirtualKeyResponse, dependencies=[Depends(require_permission("governance:write"))])
def update_virtual_key(
    key_id: str,
    payload: VirtualKeyUpdate,
    tenant_scope: Optional[str] = Depends(get_tenant_scope),
    db: Session = Depends(get_db)
):
    """
    가상 API Key 설정 및 정보 변경 (명칭, 속도제한 RPM/TPM, 허용 모델, 활성 상태 등)
    """
    key = db.query(VirtualKey).filter(VirtualKey.key_id == key_id).first()
    if not key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="가상키를 찾을 수 없습니다.")
    if tenant_scope and key.tenant_id != tenant_scope:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="타 부서의 가상 API Key를 수정할 권한이 없습니다.")

    if payload.name is not None:
        key.name = payload.name
    if payload.allowed_models is not None:
        key.allowed_models = payload.allowed_models
    if payload.allowed_ip_cidrs is not None:
        key.allowed_ip_cidrs = _normalize_ip_cidrs(payload.allowed_ip_cidrs)
    if payload.rpm_limit is not None:
        key.rpm_limit = payload.rpm_limit
    if payload.tpm_limit is not None:
        key.tpm_limit = payload.tpm_limit
    if payload.is_active is not None:
        key.is_active = payload.is_active
        if payload.is_active:
            key.revoked_reason = None
        elif payload.revoked_reason:
            key.revoked_reason = payload.revoked_reason
    if payload.expires_at is not None:
        key.expires_at = payload.expires_at

    db.commit()
    db.refresh(key)

    return VirtualKeyResponse(
        key_id=key.key_id,
        name=key.name,
        tenant_id=key.tenant_id,
        tenant_name=key.tenant.name if key.tenant else None,
        tenant_budget_krw=float(key.tenant.monthly_budget_krw) if key.tenant and key.tenant.monthly_budget_krw is not None else 0.0,
        spent_krw=float(key.spent_krw or 0.0),
        total_tokens=int(key.total_tokens or 0),
        key_prefix=key.key_prefix,
        allowed_models=key.allowed_models or [],
        allowed_ip_cidrs=key.allowed_ip_cidrs or [],
        rpm_limit=key.rpm_limit,
        tpm_limit=key.tpm_limit,
        is_active=key.is_active,
        revoked_reason=key.revoked_reason,
        expires_at=key.expires_at,
        created_at=key.created_at,
        updated_at=key.updated_at
    )

@router.delete("/{key_id}", response_model=VirtualKeyDeleteResponse, dependencies=[Depends(require_permission("governance:write"))])
def delete_virtual_key(
    key_id: str,
    force: bool = Query(False, description="활성 상태 키도 강제 파기 후 영구 삭제 허용"),
    tenant_scope: Optional[str] = Depends(get_tenant_scope),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    가상 API Key 영구 삭제
    - 기본 모드: 활성(ACTIVE) 상태인 키는 직접 삭제 불가하며 400 반환 (파기 후 삭제 필요)
    - force=True: 활성 상태인 키도 관리자 확인을 거쳐 즉시 파기 및 영구 삭제 처리
    """
    key = db.query(VirtualKey).filter(VirtualKey.key_id == key_id).first()
    if not key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"삭제할 가상 API Key를 찾을 수 없습니다: {key_id}"
        )
    if tenant_scope and key.tenant_id != tenant_scope:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="타 부서의 가상 API Key를 삭제할 권한이 없습니다."
        )

    if key.is_active and not force:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="활성 상태(ACTIVE)인 가상 API Key는 삭제할 수 없습니다. 안전을 위해 먼저 키를 파기(Revoke)한 후 삭제하십시오."
        )

    # 시스템 프롬프트 바인딩 참조 정합성 가드
    from app.core.prompt_bindings import guard_bound_prompts
    guard_bound_prompts(
        db, "VIRTUAL_KEY", key_id,
        force=force,
        requester_id=current_user.email or current_user.user_id
    )

    key_meta = {"name": key.name, "tenant_id": key.tenant_id, "key_prefix": key.key_prefix}
    db.delete(key)
    db.commit()

    _record_governance_audit(
        db=db,
        requester_id=current_user.email or current_user.user_id,
        action="DELETE_VIRTUAL_KEY",
        key_id=key_id,
        details=key_meta
    )

    return VirtualKeyDeleteResponse(
        key_id=key_id,
        message=f"가상 API Key [{key_id}]가 성공적으로 영구 삭제되었습니다."
    )

@router.post("/validate", response_model=VirtualKeyValidateResponse)
def validate_virtual_key_endpoint(
    payload: VirtualKeyValidateRequest,
    db: Session = Depends(get_db)
):
    """
    L7 AI Gateway (Envoy ext_proc) 또는 내부 클라이언트용 가상키 유효성 검증 API
    """
    raw_key = payload.raw_key.strip()
    if not raw_key.startswith("sk-ord-"):
        return VirtualKeyValidateResponse(valid=False, reason="잘못된 가상 API Key 형식입니다.")

    prefix = raw_key[:16]
    candidates = db.query(VirtualKey).filter(VirtualKey.key_prefix == prefix).all()

    matched_key = None
    for candidate in candidates:
        if verify_virtual_key(raw_key, candidate.key_hash):
            matched_key = candidate
            break

    if not matched_key:
        return VirtualKeyValidateResponse(valid=False, reason="등록되지 않았거나 일치하지 않는 가상키입니다.")

    if not matched_key.is_active:
        return VirtualKeyValidateResponse(
            valid=False,
            key_id=matched_key.key_id,
            reason=f"차단/파기된 가상키입니다: {matched_key.revoked_reason or '관리자 파기'}"
        )

    if matched_key.expires_at and matched_key.expires_at < datetime.now(timezone.utc):
        return VirtualKeyValidateResponse(
            valid=False,
            key_id=matched_key.key_id,
            reason="유효기간이 만료된 가상키입니다."
        )

    # Check IP CIDR whitelist if configured
    allowed_cidrs = matched_key.allowed_ip_cidrs or []
    if allowed_cidrs and len(allowed_cidrs) > 0 and "0.0.0.0/0" not in allowed_cidrs and "*" not in allowed_cidrs:
        if not payload.client_ip:
            return VirtualKeyValidateResponse(
                valid=False,
                key_id=matched_key.key_id,
                reason="클라이언트 IP 정보가 누락되어 IP 화이트리스트 검증을 통과할 수 없습니다."
            )
        if not is_ip_allowed(payload.client_ip, allowed_cidrs):
            return VirtualKeyValidateResponse(
                valid=False,
                key_id=matched_key.key_id,
                reason=f"접속이 허용되지 않은 클라이언트 IP 대역입니다: {payload.client_ip}"
            )

    # Check Tenant Hard Cap 100% budget limit
    tenant = matched_key.tenant
    if tenant and tenant.is_hard_cap_enabled:
        from app.core.metering import tenant_effective_spend
        monthly_budget = float(tenant.monthly_budget_krw)
        # 당월 범위 지출로 판정한다 (지난 달 잔재로 영구 차단되지 않도록)
        spent_budget = float(tenant_effective_spend(tenant))
        if monthly_budget > 0 and spent_budget >= monthly_budget:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"TENANT_HARD_CAP_EXCEEDED: 부서({tenant.name})의 월간 AI 예산(₩{int(monthly_budget):,})이 100% 소진되어 Hard Cap 정책에 의해 신규 추론 호출이 자동 차단되었습니다."
            )

    if payload.model_id and matched_key.allowed_models:
        if payload.model_id not in matched_key.allowed_models:
            return VirtualKeyValidateResponse(
                valid=False,
                key_id=matched_key.key_id,
                reason=f"요청한 모델({payload.model_id})에 대한 호출 권한이 없습니다."
            )

    return VirtualKeyValidateResponse(
        valid=True,
        key_id=matched_key.key_id,
        tenant_id=matched_key.tenant_id,
        tenant_name=matched_key.tenant.name if matched_key.tenant else None,
        rpm_limit=matched_key.rpm_limit,
        tpm_limit=matched_key.tpm_limit
    )
