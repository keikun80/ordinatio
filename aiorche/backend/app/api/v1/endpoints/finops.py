import io
import csv
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.tenant import Tenant
from app.models.model_catalog import ModelCatalog
from app.models.virtual_key import VirtualKey
from app.schemas.finops import (
    FinOpsOverviewResponse,
    TenantFinOpsSummary,
    FinOpsPricingMatrix,
    ModelPricingInfo
)
from app.api.deps import require_permission

router = APIRouter()

@router.get("/overview", response_model=FinOpsOverviewResponse, dependencies=[Depends(require_permission("finops:read"))])
def get_finops_overview(db: Session = Depends(get_db)):
    """Returns department-level budget consumption, burn rate, and pricing matrix."""
    tenants = db.query(Tenant).all()
    models = db.query(ModelCatalog).all()

    model_pricings = [
        ModelPricingInfo(
            model_id=m.model_id,
            alias=m.alias,
            backend_infra=m.backend_infra,
            input_price_per_1k=float(m.input_price_per_1k),
            output_price_per_1k=float(m.output_price_per_1k),
            cache_discount_ratio=float(m.cache_discount_ratio)
        )
        for m in models
    ]

    pricing_matrix = FinOpsPricingMatrix(
        currency="KRW",
        standard_input_per_1k=0.80,
        standard_output_per_1k=2.40,
        standard_cache_discount=0.25,
        models=model_pricings
    )

    total_budget = 0.0
    total_spent = 0.0
    tenant_summaries = []

    for t in tenants:
        monthly_budget = float(t.monthly_budget_krw)
        spent = float(t.spent_budget_krw)
        remaining = max(0.0, monthly_budget - spent)
        burn_rate = round((spent / monthly_budget * 100.0), 2) if monthly_budget > 0 else 0.0
        is_blocked = bool(t.is_hard_cap_enabled and spent >= monthly_budget and monthly_budget > 0)

        # Sum total tokens across tenant's keys
        keys = db.query(VirtualKey).filter(VirtualKey.tenant_id == t.tenant_id).all()
        tenant_tokens = sum(k.total_tokens for k in keys)

        total_budget += monthly_budget
        total_spent += spent

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
            total_tokens=tenant_tokens
        ))

    overall_burn_rate = round((total_spent / total_budget * 100.0), 2) if total_budget > 0 else 0.0
    total_remaining = max(0.0, total_budget - total_spent)

    # Projected month-end run rate
    day_of_month = datetime.now(timezone.utc).day
    projected = round((total_spent / max(1, day_of_month)) * 30.0, 0)

    return FinOpsOverviewResponse(
        total_budget_krw=total_budget,
        total_spent_krw=total_spent,
        total_remaining_krw=total_remaining,
        overall_burn_rate_pct=overall_burn_rate,
        projected_month_end_krw=projected,
        active_tenants_count=len(tenants),
        pricing_matrix=pricing_matrix,
        tenants=tenant_summaries
    )

@router.get("/invoices/export", dependencies=[Depends(require_permission("finops:write"))])
def export_finops_invoices_csv(
    month: Optional[str] = Query(None, description="Billing month in YYYY-MM format"),
    db: Session = Depends(get_db)
):
    """Streams enterprise accounting CSV invoice with UTF-8 BOM encoding for Korean Excel compatibility."""
    target_month = month or datetime.now(timezone.utc).strftime("%Y-%m")
    tenants = db.query(Tenant).all()

    output = io.StringIO()
    # Write UTF-8 Byte Order Mark (BOM) for Excel
    output.write("\uFEFF")

    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
    headers = [
        "부서ID",
        "부서명",
        "부서코드",
        "월간예산(KRW)",
        "누적지출액(KRW)",
        "잔여예산(KRW)",
        "소진율(%)",
        "하드캡적용",
        "차단상태",
        "총처리토큰",
        "결산기준월"
    ]
    writer.writerow(headers)

    for t in tenants:
        monthly_budget = float(t.monthly_budget_krw)
        spent = float(t.spent_budget_krw)
        remaining = max(0.0, monthly_budget - spent)
        burn_rate = round((spent / monthly_budget * 100.0), 2) if monthly_budget > 0 else 0.0
        is_blocked = "차단됨 (429)" if (t.is_hard_cap_enabled and spent >= monthly_budget and monthly_budget > 0) else "정상"
        hard_cap_str = "적용 (Hard Cap)" if t.is_hard_cap_enabled else "소프트 (경고만)"

        keys = db.query(VirtualKey).filter(VirtualKey.tenant_id == t.tenant_id).all()
        tenant_tokens = sum(k.total_tokens for k in keys)

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
            f"{tenant_tokens:,}",
            target_month
        ])

    csv_content = output.getvalue()
    output.close()

    filename = f"aiorche_invoice_{target_month}.csv"
    response = StreamingResponse(
        iter([csv_content]),
        media_type="text/csv; charset=utf-8"
    )
    response.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    response.headers["X-Export-Timestamp"] = datetime.now(timezone.utc).isoformat()
    return response
