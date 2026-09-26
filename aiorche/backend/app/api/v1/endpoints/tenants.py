import uuid
from typing import List
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.tenant import Tenant
from app.models.virtual_key import VirtualKey
from app.schemas.tenant import TenantCreate, TenantResponse, TenantUpdate

router = APIRouter(prefix="/tenants", tags=["Multi-Tenant Governance"])

@router.get("", response_model=List[TenantResponse])
def list_tenants(db: Session = Depends(get_db)):
    """
    모든 테넌트(부서) 목록 및 상태 조회
    """
    tenants = db.query(Tenant).order_by(Tenant.created_at.asc()).all()
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
                spent_budget_krw=t.spent_budget_krw or Decimal("0.00"),
                active_keys_count=active_count,
                created_at=t.created_at,
                updated_at=t.updated_at
            )
        )
    return results

@router.post("", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
def create_tenant(payload: TenantCreate, db: Session = Depends(get_db)):
    """
    신규 테넌트(부서) 등록
    """
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

@router.get("/{tenant_id}", response_model=TenantResponse)
def get_tenant(tenant_id: str, db: Session = Depends(get_db)):
    """
    단일 테넌트 상세 조회
    """
    tenant = db.query(Tenant).filter(Tenant.tenant_id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="테넌트를 찾을 수 없습니다.")

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

@router.patch("/{tenant_id}", response_model=TenantResponse)
def update_tenant(
    tenant_id: str,
    payload: TenantUpdate,
    db: Session = Depends(get_db)
):
    """
    테넌트(부서) 정보 수정 (예산, 부서명, 하드캡 여부)
    """
    tenant = db.query(Tenant).filter(Tenant.tenant_id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="테넌트를 찾을 수 없습니다.")

    if payload.name is not None:
        tenant.name = payload.name
    if payload.monthly_budget_krw is not None:
        tenant.monthly_budget_krw = payload.monthly_budget_krw
    if payload.is_hard_cap_enabled is not None:
        tenant.is_hard_cap_enabled = payload.is_hard_cap_enabled

    db.commit()
    db.refresh(tenant)

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


@router.delete("/{tenant_id}")
def delete_tenant(tenant_id: str, db: Session = Depends(get_db)):
    """
    테넌트(부서) 삭제
    - 활성 상태(ACTIVE)인 가상키가 남아 있는 경우 400 반환 (먼저 파기/삭제 필요)
    - 파기된 가상키는 자동 정리 후 테넌트 삭제 처리
    """
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

    # Inactive keys cleanup
    db.query(VirtualKey).filter(VirtualKey.tenant_id == tenant_id).delete(synchronize_session=False)
    db.delete(tenant)
    db.commit()

    return {"tenant_id": tenant_id, "message": f"테넌트 [{tenant_id}]가 성공적으로 삭제되었습니다."}


