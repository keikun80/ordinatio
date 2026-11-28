import uuid
import hashlib
import json
import time
from typing import List, Optional
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.tenant import Tenant
from app.models.virtual_key import VirtualKey
from app.models.user import User
from app.models.audit_log import AuditLog
from app.core.worm_storage import WormStorage
from app.schemas.tenant import TenantCreate, TenantResponse, TenantUpdate
from app.api.deps import require_permission, require_any_permission, get_tenant_scope, get_current_user

router = APIRouter(prefix="/tenants", tags=["Multi-Tenant Governance"])


def _record_tenant_audit(
    db: Session,
    requester_id: str,
    action: str,
    tenant_id: str,
    details: dict
) -> None:
    """테넌트(부서) 거버넌스 변경 WORM 감사 로그 및 DB AuditLog 불변 보관"""
    try:
        t0 = time.time()
        log_id = f"audit-dept-{int(t0 * 1000)}-{uuid.uuid4().hex[:6]}"
        details_str = json.dumps(details, ensure_ascii=False)
        payload_hash = hashlib.sha256(details_str.encode("utf-8")).hexdigest()
        
        worm_ref = WormStorage.record_audit_log(
            log_id=log_id,
            requester_id=requester_id,
            key_id=None,
            model_id=None,
            original_prompt_hash=payload_hash,
            masked_payload_hash=payload_hash,
            detections=[{"tenant_action": action, "tenant_id": tenant_id, "details": details}],
            pii_count=0,
            action_taken=action,
            latency_ms=0.0,
            is_blocked=False,
        )

        audit_entry = AuditLog(
            log_id=log_id,
            requester_id=requester_id,
            key_id=None,
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
    except Exception:
        pass


def _require_global_scope(tenant_scope: Optional[str]) -> None:
    """부서(테넌트) 생성/수정/삭제는 전사 범위(SUPER_ADMIN 등 tenant_scope=None) 사용자만 허용."""
    if tenant_scope:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="부서(테넌트) 생성·수정·삭제는 전사 관리자만 수행할 수 있습니다. (소속 부서 한정 권한)"
        )

@router.get("", response_model=List[TenantResponse], dependencies=[Depends(require_any_permission("governance:read", "users:read"))])
def list_tenants(
    tenant_scope: Optional[str] = Depends(get_tenant_scope),
    db: Session = Depends(get_db)
):
    """
    모든 테넌트(부서) 목록 및 상태 조회 (부서 한정 사용자는 소속 부서만)
    """
    query = db.query(Tenant)
    if tenant_scope:
        query = query.filter(Tenant.tenant_id == tenant_scope)
    tenants = query.order_by(Tenant.created_at.asc()).all()
    from app.core.finops_reconcile import tenant_period_spend_map
    spend_map = tenant_period_spend_map(db)
    results = []
    for t in tenants:
        active_count = db.query(VirtualKey).filter(
            VirtualKey.tenant_id == t.tenant_id,
            VirtualKey.is_active == True
        ).count()
        results.append(
            TenantResponse(
                tenant_id=t.tenant_id,
                name=t.name,
                department_code=t.department_code,
                monthly_budget_krw=t.monthly_budget_krw,
                is_hard_cap_enabled=t.is_hard_cap_enabled,
                spent_budget_krw=spend_map.get(t.tenant_id, Decimal("0.00")),
                active_keys_count=active_count,
                created_at=t.created_at,
                updated_at=t.updated_at
            )
        )
    return results

@router.post("", response_model=TenantResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("governance:write"))])
def create_tenant(
    payload: TenantCreate,
    tenant_scope: Optional[str] = Depends(get_tenant_scope),
    db: Session = Depends(get_db)
):
    """
    신규 테넌트(부서) 등록
    """
    _require_global_scope(tenant_scope)
    existing_dept = db.query(Tenant).filter(Tenant.department_code == payload.department_code).first()
    if existing_dept:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"이미 등록된 부서 코드입니다: {payload.department_code}"
        )
    
    tenant_id = payload.tenant_id or f"dept-{payload.department_code.lower().replace('_', '-')}"
    existing_id = db.query(Tenant).filter(Tenant.tenant_id == tenant_id).first()
    if existing_id:
        tenant_id = f"{tenant_id}-{uuid.uuid4().hex[:6]}"

    tenant = Tenant(
        tenant_id=tenant_id,
        name=payload.name,
        department_code=payload.department_code,
        monthly_budget_krw=payload.monthly_budget_krw,
        is_hard_cap_enabled=payload.is_hard_cap_enabled
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    return TenantResponse(
        tenant_id=tenant.tenant_id,
        name=tenant.name,
        department_code=tenant.department_code,
        monthly_budget_krw=tenant.monthly_budget_krw,
        is_hard_cap_enabled=tenant.is_hard_cap_enabled,
        spent_budget_krw=0.00,
        active_keys_count=0,
        created_at=tenant.created_at,
        updated_at=tenant.updated_at
    )

@router.get("/{tenant_id}", response_model=TenantResponse, dependencies=[Depends(require_any_permission("governance:read", "users:read"))])
def get_tenant(
    tenant_id: str,
    tenant_scope: Optional[str] = Depends(get_tenant_scope),
    db: Session = Depends(get_db)
):
    """
    단일 테넌트 상세 조회
    """
    if tenant_scope and tenant_id != tenant_scope:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="타 부서(테넌트) 정보를 조회할 권한이 없습니다.")
    tenant = db.query(Tenant).filter(Tenant.tenant_id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="테넌트를 찾을 수 없습니다.")

    active_count = db.query(VirtualKey).filter(
        VirtualKey.tenant_id == tenant.tenant_id,
        VirtualKey.is_active == True
    ).count()

    from app.core.finops_reconcile import tenant_period_spend
    return TenantResponse(
        tenant_id=tenant.tenant_id,
        name=tenant.name,
        department_code=tenant.department_code,
        monthly_budget_krw=tenant.monthly_budget_krw,
        is_hard_cap_enabled=tenant.is_hard_cap_enabled,
        spent_budget_krw=tenant_period_spend(db, tenant_id),
        active_keys_count=active_count,
        created_at=tenant.created_at,
        updated_at=tenant.updated_at
    )


@router.post("/{tenant_id}/reset-spent", response_model=TenantResponse, dependencies=[Depends(require_permission("governance:write"))])
def reset_tenant_spent_budget(
    tenant_id: str,
    tenant_scope: Optional[str] = Depends(get_tenant_scope),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    테넌트(부서) 당월 소진액 초기화 (Hard Cap 긴급 해제 / 월간 정산 롤오버)

    기록 원장(DailyTokenLedger)은 지우지 않고 **조정분개(음수 비용 행)** 를 기록한다.
    캐시 컬럼만 0 으로 만들면 원장 기준 화면(FinOps overview)은 차단으로 보이는데
    캐시 기준 집행(Hard Cap)은 통과해 'UI 는 차단, 트래픽은 허용' 불일치가 생긴다.
    조정분개 방식은 원 과금 내역과 조정 내역을 모두 남겨 감사 추적을 유지한다.
    """
    from app.core.finops_reconcile import post_budget_adjustment, tenant_period_spend

    _require_global_scope(tenant_scope)
    tenant = db.query(Tenant).filter(Tenant.tenant_id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="테넌트를 찾을 수 없습니다.")

    previous_spent = float(tenant_period_spend(db, tenant_id))
    adjustment = post_budget_adjustment(
        db=db,
        tenant_id=tenant_id,
        amount_krw=Decimal(str(-previous_spent)),
        reason="RESET_TENANT_SPENT_BUDGET",
    )
    db.refresh(tenant)

    _record_tenant_audit(
        db=db,
        requester_id=current_user.email or current_user.user_id,
        action="RESET_TENANT_SPENT_BUDGET",
        tenant_id=tenant.tenant_id,
        details={
            "previous_spent_krw": previous_spent,
            "reset_spent_krw": 0.0,
            "monthly_budget_krw": float(tenant.monthly_budget_krw),
            "ledger_adjustment": adjustment,
        }
    )

    active_count = db.query(VirtualKey).filter(
        VirtualKey.tenant_id == tenant.tenant_id,
        VirtualKey.is_active == True
    ).count()

    return TenantResponse(
        tenant_id=tenant.tenant_id,
        name=tenant.name,
        department_code=tenant.department_code,
        monthly_budget_krw=tenant.monthly_budget_krw,
        is_hard_cap_enabled=tenant.is_hard_cap_enabled,
        spent_budget_krw=tenant.spent_budget_krw or Decimal("0.00"),
        active_keys_count=active_count,
        created_at=tenant.created_at,
        updated_at=tenant.updated_at
    )

@router.patch("/{tenant_id}", response_model=TenantResponse, dependencies=[Depends(require_permission("governance:write"))])
def update_tenant(
    tenant_id: str,
    payload: TenantUpdate,
    tenant_scope: Optional[str] = Depends(get_tenant_scope),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    테넌트(부서) 정보 수정 (예산, 부서명, 하드캡 여부) - 전사 관리자 전용
    (부서 관리자가 자기 부서 예산/Hard Cap 을 직접 올려 통제를 우회하는 것을 방지)
    """
    _require_global_scope(tenant_scope)
    tenant = db.query(Tenant).filter(Tenant.tenant_id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="테넌트를 찾을 수 없습니다.")

    changes = {}
    if payload.name is not None:
        changes["name_before"] = tenant.name
        changes["name_after"] = payload.name
        tenant.name = payload.name
    if payload.monthly_budget_krw is not None:
        changes["budget_before"] = float(tenant.monthly_budget_krw)
        changes["budget_after"] = float(payload.monthly_budget_krw)
        tenant.monthly_budget_krw = payload.monthly_budget_krw
    if payload.is_hard_cap_enabled is not None:
        changes["hard_cap_before"] = tenant.is_hard_cap_enabled
        changes["hard_cap_after"] = payload.is_hard_cap_enabled
        tenant.is_hard_cap_enabled = payload.is_hard_cap_enabled

    db.commit()
    db.refresh(tenant)

    _record_tenant_audit(
        db=db,
        requester_id=current_user.email or current_user.user_id,
        action="UPDATE_TENANT_BUDGET",
        tenant_id=tenant.tenant_id,
        details=changes
    )

    active_count = db.query(VirtualKey).filter(
        VirtualKey.tenant_id == tenant.tenant_id,
        VirtualKey.is_active == True
    ).count()

    return TenantResponse(
        tenant_id=tenant.tenant_id,
        name=tenant.name,
        department_code=tenant.department_code,
        monthly_budget_krw=tenant.monthly_budget_krw,
        is_hard_cap_enabled=tenant.is_hard_cap_enabled,
        spent_budget_krw=tenant.spent_budget_krw or Decimal("0.00"),
        active_keys_count=active_count,
        created_at=tenant.created_at,
        updated_at=tenant.updated_at
    )


@router.delete("/{tenant_id}", dependencies=[Depends(require_permission("governance:write"))])
def delete_tenant(
    tenant_id: str,
    force: bool = Query(False, description="바인딩된 시스템 프롬프트를 비활성화하고 강제 삭제"),
    tenant_scope: Optional[str] = Depends(get_tenant_scope),
    db: Session = Depends(get_db)
):
    """
    테넌트(부서) 삭제
    - 활성 상태(ACTIVE)인 가상키가 남아 있는 경우 400 반환 (먼저 파기/삭제 필요)
    - 바인딩된 시스템 프롬프트가 남아 있는 경우 400 반환 (force=True 시 비활성화 후 삭제)
    - 파기된 가상키는 자동 정리 후 테넌트 삭제 처리
    """
    _require_global_scope(tenant_scope)
    tenant = db.query(Tenant).filter(Tenant.tenant_id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"테넌트를 찾을 수 없습니다: {tenant_id}")

    active_keys = db.query(VirtualKey).filter(
        VirtualKey.tenant_id == tenant_id,
        VirtualKey.is_active == True
    ).count()
    if active_keys > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"활성 상태인 가상키({active_keys}개)가 남아있어 부서를 삭제할 수 없습니다. 먼저 키를 파기/삭제하십시오."
        )

    # 시스템 프롬프트 바인딩 참조 정합성 가드
    from app.core.prompt_bindings import guard_bound_prompts
    orphaned = guard_bound_prompts(db, "TENANT", tenant_id, force=force, requester_id="TENANT_ADMIN")

    # Inactive keys cleanup
    db.query(VirtualKey).filter(VirtualKey.tenant_id == tenant_id).delete(synchronize_session=False)
    db.delete(tenant)
    db.commit()

    return {
        "tenant_id": tenant_id,
        "message": f"테넌트 [{tenant_id}]가 성공적으로 삭제되었습니다.",
        "deactivated_prompts": orphaned
    }


