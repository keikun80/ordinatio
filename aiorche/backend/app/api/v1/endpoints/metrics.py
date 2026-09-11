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

    total_tokens = db.query(func.coalesce(func.sum(VirtualKey.total_tokens), 0)).scalar() or 0
    total_cost = db.query(func.coalesce(func.sum(VirtualKey.spent_krw), Decimal("0.00"))).scalar() or Decimal("0.00")

    tenants = db.query(Tenant).all()

    lines = [
        "# HELP aiorche_virtual_keys_total Total number of registered virtual API keys",
        "# TYPE aiorche_virtual_keys_total gauge",
        f"aiorche_virtual_keys_total {total_keys}",
        "",
        "# HELP aiorche_active_keys_total Number of currently active virtual API keys",
        "# TYPE aiorche_active_keys_total gauge",
        f"aiorche_active_keys_total {active_keys}",
        "",
        "# HELP aiorche_tenants_total Number of registered tenant departments",
        "# TYPE aiorche_tenants_total gauge",
        f"aiorche_tenants_total {total_tenants}",
        "",
        "# HELP aiorche_tokens_total Total cumulative tokens processed across all keys",
        "# TYPE aiorche_tokens_total counter",
        f"aiorche_tokens_total {int(total_tokens)}",
        "",
        "# HELP aiorche_cost_total_krw Total cumulative inference cost in KRW",
        "# TYPE aiorche_cost_total_krw counter",
        f"aiorche_cost_total_krw {float(total_cost):.2f}",
        "",
        "# HELP aiorche_tenant_budget_krw Monthly budget for tenant in KRW",
        "# TYPE aiorche_tenant_budget_krw gauge"
    ]

    for t in tenants:
        dept = t.department_code
        lines.append(f'aiorche_tenant_budget_krw{{tenant_id="{t.tenant_id}",department="{dept}"}} {float(t.monthly_budget_krw):.2f}')

    lines.append("")
    lines.append("# HELP aiorche_tenant_spent_krw Cumulative spent budget for tenant in KRW")
    lines.append("# TYPE aiorche_tenant_spent_krw gauge")
    for t in tenants:
        dept = t.department_code
        spent = float(t.spent_budget_krw or 0)
        lines.append(f'aiorche_tenant_spent_krw{{tenant_id="{t.tenant_id}",department="{dept}"}} {spent:.2f}')

    lines.append("")
    lines.append("# HELP aiorche_tenant_hard_cap_enabled Hard cap budget enforcement status (1=enabled, 0=disabled)")
    lines.append("# TYPE aiorche_tenant_hard_cap_enabled gauge")
    for t in tenants:
        dept = t.department_code
        enabled = 1 if t.is_hard_cap_enabled else 0
        lines.append(f'aiorche_tenant_hard_cap_enabled{{tenant_id="{t.tenant_id}",department="{dept}"}} {enabled}')

    content = "\n".join(lines) + "\n"
    return Response(content=content, media_type="text/plain; version=0.0.4; charset=utf-8")
