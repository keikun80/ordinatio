from decimal import Decimal
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app.db.session import get_db
from app.models.tenant import Tenant
from app.models.virtual_key import VirtualKey
from app.models.model_catalog import ModelCatalog
from app.core.security import verify_virtual_key, is_ip_allowed, get_client_real_ip
from app.schemas.external import (
    UsageReportRequest,
    UsageReportResponse,
    ClientKeyInfoResponse,
    ClientModelResponse,
    TenantBudgetUpdate,
    TenantSummaryResponse
)
from app.api.deps import require_permission

router = APIRouter(prefix="/external", tags=["External Application Integration"])

def authenticate_client_key(
    request: Request,
    authorization: Optional[str] = Header(None),
    x_virtual_key: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> VirtualKey:
    """
    사내 AI 클라이언트의 Authorization: Bearer sk-ord-... 또는 X-Virtual-Key 헤더 인증
    (만료일시, IP CIDR 화이트리스트, 부서 Hard Cap 100% 한도 초과 검증 포함)
    """
    raw_key = None
    if authorization and authorization.startswith("Bearer "):
        raw_key = authorization.replace("Bearer ", "").strip()
    elif x_virtual_key:
        raw_key = x_virtual_key.strip()

    if not raw_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="인증 헤더가 누락되었습니다. 'Authorization: Bearer sk-ord-...' 형식으로 가상키를 전달하십시오."
        )

    if not raw_key.startswith("sk-ord-"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="잘못된 가상 API Key 형식입니다. 'sk-ord-' 접두사가 필요합니다."
        )

    prefix = raw_key[:16]
    candidates = db.query(VirtualKey).filter(VirtualKey.key_prefix == prefix).all()

    matched_key = None
    for candidate in candidates:
        if verify_virtual_key(raw_key, candidate.key_hash):
            matched_key = candidate
            break

    if not matched_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않거나 등록되지 않은 가상 API Key입니다."
        )

    if not matched_key.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"차단/파기된 가상키입니다: {matched_key.revoked_reason or '관리자에 의한 차단'}"
        )

    # 1. 만료일시 검증 (Expires At)
    if matched_key.expires_at and matched_key.expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="유효기간이 만료된 가상키입니다."
        )

    # 2. IP CIDR 화이트리스트 검증
    allowed_cidrs = matched_key.allowed_ip_cidrs or []
    if allowed_cidrs and len(allowed_cidrs) > 0 and "0.0.0.0/0" not in allowed_cidrs and "*" not in allowed_cidrs:
        client_ip = get_client_real_ip(request)
        if not client_ip or not is_ip_allowed(client_ip, allowed_cidrs):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"접속이 허용되지 않은 클라이언트 IP 대역입니다: {client_ip or '알 수 없음'}"
            )

    # 3. 부서 Hard Cap 100% 예산 소진 검증
    tenant = matched_key.tenant
    if tenant and tenant.is_hard_cap_enabled:
        from app.core.metering import tenant_effective_spend
        monthly_budget = float(tenant.monthly_budget_krw)
        spent_budget = float(tenant_effective_spend(tenant))
        if monthly_budget > 0 and spent_budget >= monthly_budget:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"TENANT_HARD_CAP_EXCEEDED: 부서({tenant.name})의 월간 AI 예산(₩{int(monthly_budget):,})이 100% 소진되어 Hard Cap 정책에 의해 신규 추론 호출이 자동 차단되었습니다."
            )

    return matched_key

# -----------------------------------------------------------------------------
# 1. AI 클라이언트 자가 조회 API (챗봇 / 에이전트 / 사내 포털)
# -----------------------------------------------------------------------------
@router.get("/me", response_model=ClientKeyInfoResponse)
def get_my_key_info(
    client_key: VirtualKey = Depends(authenticate_client_key),
    db: Session = Depends(get_db)
):
    """
    [외부 클라이언트용] 가상 API Key 본인 정보, 잔여 쿼터, 부서 예산 소진율 조회
    """
    tenant = client_key.tenant
    budget = tenant.monthly_budget_krw if tenant else Decimal("10000000.00")
    spent = tenant.spent_budget_krw if tenant else Decimal("0.00")
    usage_percent = float(min(Decimal("100.0"), (spent / budget) * Decimal("100.0"))) if budget > 0 else 0.0

    return ClientKeyInfoResponse(
        key_id=client_key.key_id,
        name=client_key.name,
        tenant_id=client_key.tenant_id,
        tenant_name=tenant.name if tenant else client_key.tenant_id,
        allowed_models=client_key.allowed_models or [],
        rpm_limit=client_key.rpm_limit,
        tpm_limit=client_key.tpm_limit,
        is_active=client_key.is_active,
        spent_krw=client_key.spent_krw or Decimal("0.00"),
        tenant_budget_krw=budget,
        tenant_spent_krw=spent,
        budget_usage_percent=usage_percent,
        is_hard_cap_enabled=tenant.is_hard_cap_enabled if tenant else True
    )

@router.get("/models", response_model=List[ClientModelResponse])
def get_my_allowed_models(
    client_key: VirtualKey = Depends(authenticate_client_key),
    db: Session = Depends(get_db)
):
    """
    [외부 클라이언트용] 본인 가상키로 호출 가능한 서빙 모델 목록 및 단가 카탈로그 조회 (DB 실시간 연동)
    """
    allowed = client_key.allowed_models or []
    query = db.query(ModelCatalog).filter(ModelCatalog.is_active == True)
    if allowed:
        query = query.filter(ModelCatalog.model_id.in_(allowed))
    db_models = query.all()

    return [
        ClientModelResponse(
            model_id=m.model_id,
            alias=m.alias,
            backend_infra=m.backend_infra,
            input_price_per_1k=float(m.input_price_per_1k),
            output_price_per_1k=float(m.output_price_per_1k)
        )
        for m in db_models
    ]

# -----------------------------------------------------------------------------
# 2. L7 AI 게이트웨이 텔레메트리 보고 API (Envoy ext_proc / Wasm)
# -----------------------------------------------------------------------------
@router.post("/usage/report", response_model=UsageReportResponse)
def report_gateway_usage(
    payload: UsageReportRequest,
    db: Session = Depends(get_db)
):
    """
    [L7 Gateway용] 추론 완료 시 토큰 사용량 및 지연시간 보고 ➔ 키/부서 누적 비용 실시간 가산
    """
    key = None
    if payload.key_id:
        key = db.query(VirtualKey).filter(VirtualKey.key_id == payload.key_id).first()
    elif payload.raw_key:
        prefix = payload.raw_key[:16]
        candidates = db.query(VirtualKey).filter(VirtualKey.key_prefix == prefix).all()
        for c in candidates:
            if verify_virtual_key(payload.raw_key, c.key_hash):
                key = c
                break

    if not key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="사용량을 기록할 가상 API Key를 찾을 수 없습니다."
        )

    # 계량은 단일 경로(app/core/metering.record_usage)에 위임한다.
    # 이전에는 본 엔드포인트가 단가를 하드코딩(0.0008/0.0024)하고 DailyTokenLedger 를
    # 전혀 갱신하지 않아, 이 경로로 들어온 사용량이 일/월 집계에서 영구 누락되었다.
    from app.core.metering import record_usage

    model_entry = None
    if getattr(payload, "model_id", None):
        model_entry = db.query(ModelCatalog).filter(
            or_(ModelCatalog.model_id == payload.model_id, ModelCatalog.alias == payload.model_id)
        ).first()

    tenant = key.tenant
    usage = record_usage(
        db=db,
        key=key,
        tenant=tenant,
        model_entry=model_entry,
        model_id=getattr(payload, "model_id", None),
        prompt_tokens=payload.prompt_tokens,
        completion_tokens=payload.completion_tokens,
    )
    cost = Decimal(str(usage.cost_krw))
    total_new_tokens = usage.total_tokens

    tenant_total = Decimal("0.00")
    tenant_budget = Decimal("10000000.00")
    is_hard_cap_reached = False
    if tenant:
        tenant_total = tenant.spent_budget_krw or Decimal("0.00")
        tenant_budget = tenant.monthly_budget_krw
        if tenant.is_hard_cap_enabled and tenant_total >= tenant_budget:
            is_hard_cap_reached = True

    usage_percent = float(min(Decimal("100.0"), (tenant_total / tenant_budget) * Decimal("100.0"))) if tenant_budget > 0 else 0.0

    return UsageReportResponse(
        success=True,
        key_id=key.key_id,
        tenant_id=key.tenant_id,
        added_tokens=total_new_tokens,
        added_cost_krw=cost,
        key_total_spent_krw=key.spent_krw,
        tenant_total_spent_krw=tenant_total,
        tenant_monthly_budget_krw=tenant_budget,
        tenant_usage_percent=usage_percent,
        is_hard_cap_reached=is_hard_cap_reached
    )

# -----------------------------------------------------------------------------
# 3. 사내 ERP / FinOps / 결재 시스템 연동 API
# -----------------------------------------------------------------------------
@router.get("/tenants/{tenant_id}/summary", response_model=TenantSummaryResponse, dependencies=[Depends(require_permission("finops:read"))])
def get_tenant_summary(
    tenant_id: str,
    db: Session = Depends(get_db)
):
    """
    [사내 ERP/FinOps용] 부서별 월간 예산 한도, 누적 소진액, 소진율, 활성 키 수 및 총 사용 토큰 조회
    """
    tenant = db.query(Tenant).filter(Tenant.tenant_id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="해당 테넌트를 찾을 수 없습니다.")

    active_count = db.query(VirtualKey).filter(
        VirtualKey.tenant_id == tenant_id,
        VirtualKey.is_active == True
    ).count()

    total_tokens_sum = db.query(func.coalesce(func.sum(VirtualKey.total_tokens), 0)).filter(
        VirtualKey.tenant_id == tenant_id
    ).scalar()

    budget = tenant.monthly_budget_krw
    spent = tenant.spent_budget_krw or Decimal("0.00")
    percent = float(min(Decimal("100.0"), (spent / budget) * Decimal("100.0"))) if budget > 0 else 0.0

    return TenantSummaryResponse(
        tenant_id=tenant.tenant_id,
        name=tenant.name,
        department_code=tenant.department_code,
        monthly_budget_krw=budget,
        spent_budget_krw=spent,
        usage_percent=percent,
        is_hard_cap_enabled=tenant.is_hard_cap_enabled,
        active_keys_count=active_count,
        total_tokens=int(total_tokens_sum)
    )

@router.patch("/tenants/{tenant_id}/budget", response_model=TenantSummaryResponse, dependencies=[Depends(require_permission("finops:write"))])
def update_tenant_budget(
    tenant_id: str,
    payload: TenantBudgetUpdate,
    db: Session = Depends(get_db)
):
    """
    [사내 ERP/FinOps용] 결재 완료 시 부서 월간 예산 증액/감액 및 하드캡 정책 변경
    """
    tenant = db.query(Tenant).filter(Tenant.tenant_id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="해당 테넌트를 찾을 수 없습니다.")

    if payload.monthly_budget_krw is not None:
        tenant.monthly_budget_krw = payload.monthly_budget_krw
    if payload.is_hard_cap_enabled is not None:
        tenant.is_hard_cap_enabled = payload.is_hard_cap_enabled

    db.commit()
    db.refresh(tenant)

    return get_tenant_summary(tenant_id, db)
