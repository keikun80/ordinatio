from decimal import Decimal
from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.session import get_db
from app.models.tenant import Tenant
from app.models.virtual_key import VirtualKey

router = APIRouter(tags=["Prometheus Metrics Exposition"])

@router.get("/metrics")
def get_prometheus_metrics(db: Session = Depends(get_db)):
    """
    [외부 Prometheus 관제기용] Prometheus 표준 텍스트 포맷 메트릭 출력 엔드포인트
    """
    total_keys = db.query(VirtualKey).count()
    active_keys = db.query(VirtualKey).filter(VirtualKey.is_active == True).count()
    total_tenants = db.query(Tenant).count()

    # 비용/토큰은 FinOps 기록 원장(DailyTokenLedger)을 기준으로 집계한다.
    # 이전에는 VirtualKey.spent_krw 를 합산해, 같은 "전사 누적 비용"을 두고
    # Prometheus 와 FinOps 콘솔(Tenant.spent_budget_krw 기준)이 서로 다른 값을 보고했다.
    from app.core.billing_period import current_month
    from app.core.finops_reconcile import compute_drift, total_period_cost
    from app.models.daily_token_ledger import DailyTokenLedger

    billing_month = current_month()
    total_cost = total_period_cost(db, billing_month)
    total_tokens = db.query(func.coalesce(func.sum(DailyTokenLedger.total_tokens), 0)).scalar() or 0
    drift = compute_drift(db, billing_month)

    tenants = db.query(Tenant).all()

    lines = [
        "# HELP ordinatio_virtual_keys_total Total number of registered virtual API keys",
        "# TYPE ordinatio_virtual_keys_total gauge",
        f"ordinatio_virtual_keys_total {total_keys}",
        "",
        "# HELP ordinatio_active_keys_total Number of currently active virtual API keys",
        "# TYPE ordinatio_active_keys_total gauge",
        f"ordinatio_active_keys_total {active_keys}",
        "",
        "# HELP ordinatio_tenants_total Number of registered tenant departments",
        "# TYPE ordinatio_tenants_total gauge",
        f"ordinatio_tenants_total {total_tenants}",
        "",
        "# HELP ordinatio_tokens_total Total cumulative tokens processed across all keys",
        "# TYPE ordinatio_tokens_total counter",
        f"ordinatio_tokens_total {int(total_tokens)}",
        "",
        "# HELP ordinatio_cost_total_krw Total cumulative inference cost in KRW",
        "# TYPE ordinatio_cost_total_krw counter",
        f"ordinatio_cost_total_krw {float(total_cost):.2f}",
        "",
        "# HELP ordinatio_tenant_budget_krw Monthly budget for tenant in KRW",
        "# TYPE ordinatio_tenant_budget_krw gauge"
    ]

    for t in tenants:
        dept = t.department_code
        lines.append(f'ordinatio_tenant_budget_krw{{tenant_id="{t.tenant_id}",department="{dept}"}} {float(t.monthly_budget_krw):.2f}')

    lines.append("")
    lines.append("# HELP ordinatio_tenant_spent_krw Billing-month spend for tenant in KRW (ledger-derived)")
    lines.append("# TYPE ordinatio_tenant_spent_krw gauge")
    from app.core.finops_reconcile import tenant_period_spend_map
    spend_map = tenant_period_spend_map(db, billing_month)
    for t in tenants:
        dept = t.department_code
        spent = float(spend_map.get(t.tenant_id, Decimal("0.00")))
        lines.append(f'ordinatio_tenant_spent_krw{{tenant_id="{t.tenant_id}",department="{dept}"}} {spent:.2f}')

    lines.append("")
    lines.append("# HELP ordinatio_finops_cache_drift_krw Absolute drift between cached spend columns and the ledger (0 = consistent)")
    lines.append("# TYPE ordinatio_finops_cache_drift_krw gauge")
    lines.append(f'ordinatio_finops_cache_drift_krw{{billing_month="{billing_month}"}} {float(drift["total_drift_krw"]):.2f}')
    lines.append("")
    lines.append("# HELP ordinatio_finops_drifted_tenants Number of tenants whose cached spend disagrees with the ledger")
    lines.append("# TYPE ordinatio_finops_drifted_tenants gauge")
    lines.append(f'ordinatio_finops_drifted_tenants {int(drift["drifted_tenant_count"])}')

    lines.append("")
    lines.append("# HELP ordinatio_tenant_hard_cap_enabled Hard cap budget enforcement status (1=enabled, 0=disabled)")
    lines.append("# TYPE ordinatio_tenant_hard_cap_enabled gauge")
    for t in tenants:
        dept = t.department_code
        enabled = 1 if t.is_hard_cap_enabled else 0
        lines.append(f'ordinatio_tenant_hard_cap_enabled{{tenant_id="{t.tenant_id}",department="{dept}"}} {enabled}')

    content = "\n".join(lines) + "\n"
    return Response(content=content, media_type="text/plain; version=0.0.4; charset=utf-8")
