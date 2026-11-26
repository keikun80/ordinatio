"""FinOps 비용 거버넌스 & 예산 관제 API.

SSOT 규칙:
  * 기록 원장 = DailyTokenLedger (PostgreSQL). 당월/특정월 지출은 날짜 범위 합계로 '파생'한다.
    따라서 월 경계가 자동 처리되어 월간 리셋 크론이 필요 없고, Hard Cap 이 달이 바뀌어도
    영구 차단으로 남지 않으며, 과거 월 청구서를 실제 그 달의 수치로 생성할 수 있다.
  * Tenant.spent_budget_krw 등은 읽기 캐시이며 drift_krw 로 불일치를 노출한다.
  * 표준 단가 = system_settings.finops_pricing (app/core/finops_pricing.py)
"""
import csv
import io
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permission
from app.core.billing_period import (
    InvalidBillingMonth,
    current_month,
    days_in_period,
    elapsed_days_in_period,
    parse_month,
    period_range,
)
from app.core.finops_pricing import get_standard_pricing, set_standard_pricing
from app.core.finops_reconcile import (
    backfill_legacy_counter,
    compute_drift,
    reconcile,
    tenant_period_spend_map,
    tenant_period_tokens_map,
    total_period_cost,
)
from app.core.semantic_cache import semantic_cache
from app.db.session import get_db
from app.models.daily_token_ledger import DailyTokenLedger
from app.models.model_catalog import ModelCatalog
from app.models.tenant import Tenant
from app.schemas.finops import (
    FinOpsOverviewResponse,
    FinOpsPricingMatrix,
    ModelPricingInfo,
    PricingUpdateRequest,
    ReconcileResponse,
    TenantFinOpsSummary,
)

router = APIRouter()


def _resolve_month(month: Optional[str]) -> str:
    try:
        return parse_month(month)
    except InvalidBillingMonth as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


def _budget_policy(db: Session) -> dict:
    from app.models.system_setting import SystemSetting

    defaults = {"soft_cap_threshold_pct": 80.0, "alert_webhook_url": "", "alert_enabled": False}
    try:
        row = db.query(SystemSetting).filter(SystemSetting.key == "finops_budget_policy").first()
        if row and isinstance(row.value, dict):
            defaults.update({k: v for k, v in row.value.items() if v is not None})
    except Exception:
        pass
    defaults["soft_cap_threshold_pct"] = float(defaults["soft_cap_threshold_pct"])
    return defaults


def _semantic_cache_saved(db: Session, month: str) -> float:
    """결산월 누적 시맨틱 캐시 절감액 (원장 영속값).

    semantic_cache.stats() 는 프로세스 메모리라 재시작 시 0 이 되고 복제본마다 달라
    회계 지표로 쓸 수 없다. 원장의 cache_saved_krw 를 사용한다.
    """
    start, end = period_range(month)
    total = (
        db.query(func.sum(DailyTokenLedger.cache_saved_krw))
        .filter(DailyTokenLedger.date >= start, DailyTokenLedger.date <= end)
        .scalar()
    )
    return float(total or 0.0)


@router.get("/semantic-cache", dependencies=[Depends(require_permission("finops:read"))])
def get_semantic_cache_stats(db: Session = Depends(get_db)):
    """
    시맨틱 캐시 런타임 지표 + 원장 기반 누적 절감액.

    runtime_* 값은 현재 프로세스 기준이며(복제본마다 다름), 회계용 절감액은
    PostgreSQL 원장에서 집계한 persisted_saved_krw 를 사용해야 한다.
    """
    month = current_month()
    stats = dict(semantic_cache.stats())
    stats["runtime_scope"] = "process-local"
    stats["persisted_saved_krw"] = _semantic_cache_saved(db, month)
    stats["billing_month"] = month
    return stats


@router.get("/pricing", dependencies=[Depends(require_permission("finops:read"))])
def get_finops_pricing(db: Session = Depends(get_db)):
    """표준 토큰 단가 조회 (system_settings SSOT)."""
    return get_standard_pricing(db)


@router.patch("/pricing", dependencies=[Depends(require_permission("finops:write"))])
def update_finops_pricing(payload: PricingUpdateRequest, db: Session = Depends(get_db)):
    """표준 토큰 단가 수정. 이전에는 코드 상수라 운영자가 바꿀 수단이 없었다."""
    return set_standard_pricing(db, payload.model_dump(exclude_none=True))


@router.get("/overview", response_model=FinOpsOverviewResponse, dependencies=[Depends(require_permission("finops:read"))])
def get_finops_overview(
    month: Optional[str] = Query(None, description="회계 결산월 (YYYY-MM, 기본값 당월)"),
    db: Session = Depends(get_db),
):
    """부서별 결산월 예산 소진율, 번레이트, 단가표를 반환한다 (원장 기준)."""
    billing_month = _resolve_month(month)
    tenants = db.query(Tenant).all()
    models = db.query(ModelCatalog).all()
    policy = _budget_policy(db)
    soft_threshold = policy["soft_cap_threshold_pct"]

    std = get_standard_pricing(db)
    pricing_matrix = FinOpsPricingMatrix(
        currency=std["currency"],
        standard_input_per_1k=std["input_per_1k"],
        standard_output_per_1k=std["output_per_1k"],
        standard_cache_discount=std["cache_discount_ratio"],
        models=[
            ModelPricingInfo(
                model_id=m.model_id,
                alias=m.alias,
                backend_infra=m.backend_infra,
                input_price_per_1k=float(m.input_price_per_1k),
                output_price_per_1k=float(m.output_price_per_1k),
                cache_discount_ratio=float(m.cache_discount_ratio),
            )
            for m in models
        ],
    )

    # 원장 기준 결산월 집계 (SSOT)
    spend_map = tenant_period_spend_map(db, billing_month)
    token_map = tenant_period_tokens_map(db, billing_month)

    total_budget = 0.0
    total_spent = 0.0
    total_drift = 0.0
    tenant_summaries = []

    for t in tenants:
        monthly_budget = float(t.monthly_budget_krw)
        spent = float(spend_map.get(t.tenant_id, Decimal("0.00")))
        cached_spent = float(t.spent_budget_krw or 0)
        drift = round(cached_spent - spent, 2)
        remaining = max(0.0, monthly_budget - spent)
        burn_rate = round((spent / monthly_budget * 100.0), 2) if monthly_budget > 0 else 0.0
        is_blocked = bool(t.is_hard_cap_enabled and monthly_budget > 0 and spent >= monthly_budget)
        is_soft = bool(not is_blocked and burn_rate >= soft_threshold)

        total_budget += monthly_budget
        total_spent += spent
        total_drift += abs(drift)

        tenant_summaries.append(TenantFinOpsSummary(
            tenant_id=t.tenant_id,
            tenant_name=t.name,
            department_code=t.department_code,
            monthly_budget_krw=monthly_budget,
            spent_budget_krw=spent,
            remaining_budget_krw=remaining,
            burn_rate_pct=burn_rate,
            is_hard_cap_enabled=t.is_hard_cap_enabled,
            is_blocked=is_blocked,
            is_soft_cap_reached=is_soft,
            total_tokens=token_map.get(t.tenant_id, 0),
            cached_spent_krw=cached_spent,
            drift_krw=drift,
        ))

    # 전사 총 지출은 '원장 전체' 기준이다. 존재하는 테넌트만 합산하면 귀속 불가(global) 또는
    # 삭제된 테넌트의 실제 지출이 누락되어, 같은 개념을 보고하는 Prometheus 와 어긋난다.
    ledger_total = float(total_period_cost(db, billing_month))
    attributed_total = total_spent
    unattributed = round(max(0.0, ledger_total - attributed_total), 2)
    total_spent = ledger_total

    overall_burn_rate = round((total_spent / total_budget * 100.0), 2) if total_budget > 0 else 0.0
    total_remaining = max(0.0, total_budget - total_spent)

    # 결산월 경과일 기준 Run Rate (이전에는 누적 전체를 당월로 오인해 now().day 로 나눴다)
    elapsed = max(1, elapsed_days_in_period(billing_month))
    projected = round((total_spent / elapsed) * days_in_period(billing_month), 0)

    return FinOpsOverviewResponse(
        total_budget_krw=total_budget,
        total_spent_krw=total_spent,
        total_remaining_krw=total_remaining,
        overall_burn_rate_pct=overall_burn_rate,
        projected_month_end_krw=projected,
        active_tenants_count=len(tenants),
        billing_month=billing_month,
        soft_cap_threshold_pct=soft_threshold,
        cache_drift_krw=round(total_drift, 2),
        unattributed_spent_krw=unattributed,
        semantic_cache_saved_krw=_semantic_cache_saved(db, billing_month),
        pricing_matrix=pricing_matrix,
        tenants=tenant_summaries,
    )


@router.get("/drift", response_model=ReconcileResponse, dependencies=[Depends(require_permission("finops:read"))])
def get_finops_drift(
    month: Optional[str] = Query(None, description="회계 결산월 (YYYY-MM, 기본값 당월)"),
    db: Session = Depends(get_db),
):
    """캐시와 원장의 차이를 조회한다 (읽기 전용)."""
    return ReconcileResponse(**compute_drift(db, _resolve_month(month)))


@router.post("/reconcile", response_model=ReconcileResponse, dependencies=[Depends(require_permission("finops:write"))])
def reconcile_finops_cache(
    month: Optional[str] = Query(None, description="회계 결산월 (YYYY-MM, 기본값 당월)"),
    apply: bool = Query(True, description="false 면 드리프트만 보고 (dry-run)"),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """읽기 캐시를 원장 기준으로 재구축한다."""
    billing_month = _resolve_month(month)
    result = reconcile(db, billing_month, apply=apply)

    if result.get("applied") and result.get("total_drift_krw", 0) > 0:
        from app.api.v1.endpoints.system_prompts import _record_prompt_audit_log

        _record_prompt_audit_log(
            db=db,
            requester_id=getattr(current_user, "username", "FINOPS_ADMIN"),
            action="FINOPS_DRIFT_RECONCILED",
            prompt_id=f"finops-{billing_month}",
            details=result,
        )
    return ReconcileResponse(**result)


@router.post("/backfill-legacy-counter", dependencies=[Depends(require_permission("finops:write"))])
def backfill_legacy_finops_counter(
    month: Optional[str] = Query(None, description="이관 대상 결산월 (YYYY-MM, 기본값 당월)"),
    confirm: bool = Query(False, description="회계 수치가 변경됨을 확인했는지 여부 (필수)"),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    [운영자 명시 호출 전용] 레거시 러닝 카운터를 원장으로 이관한다.

    전환 이전 Tenant.spent_budget_krw 는 '생성 이후 전체 누적'이고 신규 산출은
    '당월 합계'이므로, 과거 원장이 없으면 전환 직후 당월 지출이 0 으로 보인다.
    본 API 는 그 차액을 해당 월 원장 행(model_id='__migrated__')으로 1회 기록한다.

    회계 수치가 달라지는 작업이라 자동 실행하지 않으며 confirm=true 를 요구한다.
    """
    if not confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "본 작업은 회계 수치를 변경합니다. 레거시 누적 카운터와 원장의 차액이 "
                "지정 월의 원장 행으로 기록됩니다. 확인 후 confirm=true 로 재요청하십시오."
            ),
        )
    requester = getattr(current_user, "username", "FINOPS_ADMIN")
    return backfill_legacy_counter(db, _resolve_month(month), requester=requester)


@router.get("/invoices/export", dependencies=[Depends(require_permission("finops:write"))])
def export_finops_invoices_csv(
    month: Optional[str] = Query(None, description="결산월 (YYYY-MM)"),
    db: Session = Depends(get_db),
):
    """
    부서별 회계 결산 정산서 CSV 스트리밍 (한국어 Excel 호환 UTF-8 BOM).

    이전 구현은 month 를 라벨로만 썼기 때문에 2020-01 청구서에도 '현재 누적치'가
    담겼다. 이제 원장을 결산월 범위로 집계해 실제 그 달의 수치를 내보낸다.
    """
    billing_month = _resolve_month(month)
    tenants = db.query(Tenant).all()
    spend_map = tenant_period_spend_map(db, billing_month)
    token_map = tenant_period_tokens_map(db, billing_month)

    output = io.StringIO()
    output.write("\uFEFF")  # Excel 용 UTF-8 BOM (한국어 Excel 호환)

    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
    writer.writerow([
        "부서ID", "부서명", "부서코드", "월간예산(KRW)", "누적지출액(KRW)",
        "잔여예산(KRW)", "소진율(%)", "하드캡적용", "차단상태", "총처리토큰", "결산기준월",
    ])

    for t in tenants:
        monthly_budget = float(t.monthly_budget_krw)
        spent = float(spend_map.get(t.tenant_id, Decimal("0.00")))
        remaining = max(0.0, monthly_budget - spent)
        burn_rate = round((spent / monthly_budget * 100.0), 2) if monthly_budget > 0 else 0.0
        is_blocked = "차단됨 (429)" if (t.is_hard_cap_enabled and monthly_budget > 0 and spent >= monthly_budget) else "정상"
        hard_cap_str = "적용 (Hard Cap)" if t.is_hard_cap_enabled else "소프트 (경고만)"

        writer.writerow([
            t.tenant_id,
            t.name,
            t.department_code,
            f"{int(monthly_budget):,}",
            f"{int(spent):,}",
            f"{int(remaining):,}",
            f"{burn_rate}%",
            hard_cap_str,
            is_blocked,
            f"{token_map.get(t.tenant_id, 0):,}",
            billing_month,
        ])

    csv_content = output.getvalue()
    output.close()

    response = StreamingResponse(iter([csv_content]), media_type="text/csv; charset=utf-8")
    response.headers["Content-Disposition"] = f'attachment; filename="ordinatio_invoice_{billing_month}.csv"'
    response.headers["X-Export-Timestamp"] = datetime.now(timezone.utc).isoformat()
    response.headers["X-Billing-Month"] = billing_month
    return response
