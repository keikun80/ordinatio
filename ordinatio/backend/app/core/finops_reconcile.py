"""FinOps 캐시 정합화 (Reconciliation).

Tenant.spent_budget_krw / VirtualKey.spent_krw / VirtualKey.total_tokens 는
읽기 성능용 캐시이고, 기록 원장(DailyTokenLedger)이 SSOT 다.

단일 트랜잭션 계량(app/core/metering)으로 신규 드리프트는 차단되지만,
다음 경우에는 캐시가 원장과 어긋날 수 있다:
  * 본 변경 이전에 분리된 트랜잭션으로 기록된 과거 데이터
  * 운영자가 DB 를 직접 수정한 경우
  * 원장만 남기고 캐시를 초기화한 복구 작업 직후

따라서 드리프트를 '탐지 가능'하게 만들고(관측), '복구 가능'하게 만든다(정합화).
"""
from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.billing_period import period_range
from app.models.daily_token_ledger import DailyTokenLedger
from app.models.tenant import Tenant
from app.models.virtual_key import VirtualKey

logger = logging.getLogger("finops_reconcile")


def tenant_period_spend(db: Session, tenant_id: str, month: Optional[str] = None) -> Decimal:
    """원장 기준 해당 결산월의 테넌트 지출 (SSOT)."""
    start, end = period_range(month)
    total = (
        db.query(func.sum(DailyTokenLedger.cost_krw))
        .filter(
            DailyTokenLedger.tenant_id == tenant_id,
            DailyTokenLedger.date >= start,
            DailyTokenLedger.date <= end,
        )
        .scalar()
    )
    return Decimal(str(total)) if total is not None else Decimal("0.00")


def tenant_period_spend_map(db: Session, month: Optional[str] = None) -> Dict[str, Decimal]:
    """결산월의 테넌트별 지출을 한 번에 조회 (N+1 방지)."""
    start, end = period_range(month)
    rows = (
        db.query(DailyTokenLedger.tenant_id, func.sum(DailyTokenLedger.cost_krw))
        .filter(DailyTokenLedger.date >= start, DailyTokenLedger.date <= end)
        .group_by(DailyTokenLedger.tenant_id)
        .all()
    )
    return {t_id: Decimal(str(total or 0)) for t_id, total in rows}


def tenant_period_tokens_map(db: Session, month: Optional[str] = None) -> Dict[str, int]:
    start, end = period_range(month)
    rows = (
        db.query(DailyTokenLedger.tenant_id, func.sum(DailyTokenLedger.total_tokens))
        .filter(DailyTokenLedger.date >= start, DailyTokenLedger.date <= end)
        .group_by(DailyTokenLedger.tenant_id)
        .all()
    )
    return {t_id: int(total or 0) for t_id, total in rows}


def total_period_cost(db: Session, month: Optional[str] = None) -> Decimal:
    start, end = period_range(month)
    total = (
        db.query(func.sum(DailyTokenLedger.cost_krw))
        .filter(DailyTokenLedger.date >= start, DailyTokenLedger.date <= end)
        .scalar()
    )
    return Decimal(str(total)) if total is not None else Decimal("0.00")


def compute_drift(db: Session, month: Optional[str] = None) -> Dict[str, Any]:
    """캐시와 원장의 차이를 계산한다 (쓰기 없음)."""
    ledger_map = tenant_period_spend_map(db, month)
    tenants = db.query(Tenant).all()

    details: List[Dict[str, Any]] = []
    total_drift = Decimal("0.00")
    for t in tenants:
        cached = Decimal(str(t.spent_budget_krw or 0))
        actual = ledger_map.get(t.tenant_id, Decimal("0.00"))
        diff = cached - actual
        if diff != 0:
            details.append({
                "tenant_id": t.tenant_id,
                "tenant_name": t.name,
                "cached_krw": float(cached),
                "ledger_krw": float(actual),
                "drift_krw": float(diff),
            })
            total_drift += abs(diff)

    return {
        "month": month,
        "total_drift_krw": float(total_drift),
        "drifted_tenant_count": len(details),
        "details": details,
    }


def reconcile(db: Session, month: Optional[str] = None, apply: bool = True) -> Dict[str, Any]:
    """
    캐시를 원장 기준으로 재구축한다.

    apply=False 면 드리프트만 보고하고 아무것도 쓰지 않는다(dry-run).
    """
    result = compute_drift(db, month)
    result["applied"] = False

    if not apply or result["drifted_tenant_count"] == 0:
        return result

    ledger_map = tenant_period_spend_map(db, month)
    key_rows = _key_period_map(db, month)

    from app.core.billing_period import current_month, parse_month

    stamp = parse_month(month)
    try:
        for t in db.query(Tenant).all():
            t.spent_budget_krw = ledger_map.get(t.tenant_id, Decimal("0.00"))
            t.spent_period_month = stamp
        for k in db.query(VirtualKey).all():
            cost, tokens = key_rows.get(k.key_id, (Decimal("0.00"), 0))
            k.spent_krw = cost
            k.total_tokens = tokens
            k.spent_period_month = stamp
        db.commit()
        result["applied"] = True
    except Exception as e:
        db.rollback()
        logger.error("FinOps 캐시 정합화 실패 (month=%s): %s", month, e, exc_info=True)
        result["error"] = str(e)

    return result


def _key_period_map(db: Session, month: Optional[str] = None):
    start, end = period_range(month)
    rows = (
        db.query(
            DailyTokenLedger.key_id,
            func.sum(DailyTokenLedger.cost_krw),
            func.sum(DailyTokenLedger.total_tokens),
        )
        .filter(DailyTokenLedger.date >= start, DailyTokenLedger.date <= end)
        .group_by(DailyTokenLedger.key_id)
        .all()
    )
    return {k_id: (Decimal(str(cost or 0)), int(tok or 0)) for k_id, cost, tok in rows}


def post_budget_adjustment(
    db: Session,
    tenant_id: str,
    amount_krw: Decimal,
    reason: str,
    month: Optional[str] = None,
) -> Dict[str, Any]:
    """
    예산 조정분개를 원장에 기록하고 캐시를 동기화한다.

    기록 원장은 지우지 않는다. '월간 정산 롤오버'나 'Hard Cap 긴급 해제' 같은 운영
    행위를 캐시 컬럼만 0 으로 만들어 처리하면, 원장 기준 화면(FinOps overview)은
    여전히 차단으로 보이는데 캐시 기준 집행(Hard Cap)은 통과하는 상태가 되어
    'UI 는 차단, 트래픽은 허용' 불일치가 발생한다.

    대신 음수 비용 행(model_id='__adjustment__')을 추가해 원장 합계를 조정한다.
    원 과금 내역과 조정 내역이 모두 남으므로 감사 추적이 유지된다.
    """
    normalized = month or None
    start, _end = period_range(normalized)
    amount = Decimal(str(amount_krw))

    row = DailyTokenLedger(
        date=start,
        tenant_id=tenant_id,
        model_id="__adjustment__",
        key_id="none",
        prompt_tokens=0,
        completion_tokens=0,
        total_tokens=0,
        cost_krw=amount,
        request_count=0,
    )
    try:
        existing = (
            db.query(DailyTokenLedger)
            .filter(
                DailyTokenLedger.date == start,
                DailyTokenLedger.tenant_id == tenant_id,
                DailyTokenLedger.model_id == "__adjustment__",
                DailyTokenLedger.key_id == "none",
            )
            .first()
        )
        if existing:
            existing.cost_krw = (existing.cost_krw or Decimal("0.00")) + amount
        else:
            db.add(row)

        # 캐시를 조정 후 원장 합계로 맞춘다 (드리프트 0 유지)
        tenant = db.query(Tenant).filter(Tenant.tenant_id == tenant_id).first()
        db.flush()
        if tenant is not None:
            from app.core.billing_period import current_month

            new_total = tenant_period_spend(db, tenant_id, normalized)
            tenant.spent_budget_krw = new_total if new_total > 0 else Decimal("0.00")
            tenant.spent_period_month = current_month()
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error("예산 조정분개 기록 실패 (tenant=%s, amount=%s): %s", tenant_id, amount, e, exc_info=True)
        return {"tenant_id": tenant_id, "adjusted_krw": 0.0, "error": str(e)}

    return {
        "tenant_id": tenant_id,
        "adjusted_krw": float(amount),
        "reason": reason,
        "ledger_total_after_krw": float(tenant_period_spend(db, tenant_id, normalized)),
    }


def backfill_legacy_counter(
    db: Session,
    month: Optional[str] = None,
    requester: str = "SYSTEM",
) -> Dict[str, Any]:
    """
    [운영자 명시 호출 전용] 레거시 러닝 카운터를 원장으로 이관한다.

    전환 이전의 Tenant.spent_budget_krw 는 '생성 이후 전체 누적'이고 신규 산출은
    '당월 합계'이므로, 과거 원장이 없으면 전환 직후 당월 지출이 0 으로 보인다.
    본 함수는 캐시와 원장의 차액을 해당 월의 원장 행(model_id='__migrated__')으로
    1회 기록해 연속성을 유지한다.

    회계 수치가 바뀌는 작업이므로 자동 실행하지 않는다. 이미 이관 행이 있으면
    중복 적용하지 않는다(idempotent).
    """
    from app.core.billing_period import parse_month

    normalized = parse_month(month)
    start, _end = period_range(normalized)
    ledger_map = tenant_period_spend_map(db, normalized)

    migrated: List[Dict[str, Any]] = []
    try:
        for t in db.query(Tenant).all():
            cached = Decimal(str(t.spent_budget_krw or 0))
            actual = ledger_map.get(t.tenant_id, Decimal("0.00"))
            gap = cached - actual
            if gap <= 0:
                continue

            existing = (
                db.query(DailyTokenLedger)
                .filter(
                    DailyTokenLedger.date == start,
                    DailyTokenLedger.tenant_id == t.tenant_id,
                    DailyTokenLedger.model_id == "__migrated__",
                    DailyTokenLedger.key_id == "none",
                )
                .first()
            )
            if existing:
                continue

            db.add(DailyTokenLedger(
                date=start,
                tenant_id=t.tenant_id,
                model_id="__migrated__",
                key_id="none",
                prompt_tokens=0,
                completion_tokens=0,
                total_tokens=0,
                cost_krw=gap,
                request_count=0,
            ))
            migrated.append({
                "tenant_id": t.tenant_id,
                "tenant_name": t.name,
                "migrated_krw": float(gap),
            })
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error("레거시 카운터 이관 실패 (month=%s): %s", normalized, e, exc_info=True)
        return {"month": normalized, "migrated": [], "error": str(e)}

    logger.warning(
        "레거시 FinOps 카운터 이관 완료 (month=%s, requester=%s, tenants=%d)",
        normalized, requester, len(migrated),
    )
    return {"month": normalized, "requested_by": requester, "migrated": migrated}
