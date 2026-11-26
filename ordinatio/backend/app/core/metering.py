"""토큰 계량 및 과금 단일 기록 경로 (Single Write Path).

본 모듈이 FinOps 회계의 유일한 쓰기 지점이다. 이전에는 세 경로
(gateway._meter_and_bill / external.report_gateway_usage / token_meter.record_daily_tokens)가
서로 다른 카운터 부분집합을 갱신해 다음 분기가 구조적으로 발생했다.

  - external 경로는 DailyTokenLedger 를 전혀 갱신하지 않아 일/월 집계가 과소 보고됨
  - gateway 경로는 `if key:` / `if tenant:` 독립 분기라 한쪽만 증가 가능
  - 단가가 네 곳(gateway=ModelCatalog, external=하드코딩, finops=상수, 프론트=첫 모델)에 분산
  - 계량이 2개 트랜잭션 + Redis 쓰기로 쪼개져 부분 실패 시 영구 불일치

SSOT 규칙:
  * 기록 원장(ledger of record)  = DailyTokenLedger (PostgreSQL)
      (date, tenant_id, model_id, key_id) 단위. 당월 지출은 날짜 범위 합계로 '파생'한다.
      따라서 월 경계가 자동 처리되어 별도의 월간 리셋 크론이 필요 없다.
  * Tenant.spent_budget_krw / VirtualKey.spent_krw / VirtualKey.total_tokens
      = 읽기 성능용 '캐시'. 원장에서 언제든 재구축 가능(app/core/finops_reconcile.py).
  * Redis = 과금 경로에서 사용하지 않는다. 레이트리밋 전용(근사치 허용).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date as date_cls, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.models.daily_token_ledger import DailyTokenLedger
from app.models.tenant import Tenant
from app.models.virtual_key import VirtualKey

logger = logging.getLogger("metering")

# 테넌트/키를 특정할 수 없는 호출도 원장에서 누락되지 않도록 사용하는 보류 식별자.
# 이전 구현은 테넌트를 못 찾으면 집계 자체를 건너뛰어 사용량이 사라졌다.
UNATTRIBUTED_TENANT = "global"
UNATTRIBUTED_KEY = "none"
UNATTRIBUTED_MODEL = "default"


@dataclass
class UsageRecord:
    """계량 결과. 호출부가 응답 메타데이터로 그대로 사용한다."""
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    cost_krw: float
    input_price_per_1k: float
    output_price_per_1k: float
    tenant_id: Optional[str] = None
    tenant_name: Optional[str] = None
    key_id: Optional[str] = None
    model_id: Optional[str] = None
    ledger_date: Optional[date_cls] = None
    cache_hit: bool = False
    cache_saved_krw: float = 0.0
    persisted: bool = True
    extra: Dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> Dict[str, Any]:
        return {
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "total_tokens": self.total_tokens,
            "cost_krw": self.cost_krw,
            "tenant_id": self.tenant_id,
            "tenant_name": self.tenant_name,
        }


def resolve_pricing(db: Session, model_entry: Optional[Any]) -> tuple[float, float, float]:
    """
    단가 해석 (단일 경로).
    모델별 ModelCatalog 값이 우선이고, 없으면 system_settings.finops_pricing 기본값을 쓴다.
    반환: (input_per_1k, output_per_1k, cache_discount_ratio)
    """
    from app.core.finops_pricing import get_standard_pricing

    std = get_standard_pricing(db)
    input_price = std["input_per_1k"]
    output_price = std["output_per_1k"]
    discount = std["cache_discount_ratio"]

    if model_entry is not None:
        if getattr(model_entry, "input_price_per_1k", None):
            input_price = float(model_entry.input_price_per_1k)
        if getattr(model_entry, "output_price_per_1k", None):
            output_price = float(model_entry.output_price_per_1k)
        if getattr(model_entry, "cache_discount_ratio", None) is not None:
            discount = float(model_entry.cache_discount_ratio)

    return input_price, output_price, discount


def compute_cost(
    prompt_tokens: int,
    completion_tokens: int,
    input_price_per_1k: float,
    output_price_per_1k: float,
) -> float:
    return round(
        (max(0, prompt_tokens) * input_price_per_1k / 1000.0)
        + (max(0, completion_tokens) * output_price_per_1k / 1000.0),
        2,
    )


def tenant_effective_spend(tenant: Optional[Tenant], now: Optional[datetime] = None) -> Decimal:
    """
    Hard Cap 판정용 당월 지출 (O(1) 캐시 조회).

    `spent_budget_krw` 는 `spent_period_month` 와 짝으로만 유효하다. 저장된 월이
    당월이 아니면 지난 달 잔재이므로 0 을 반환한다. 이 규칙이 없으면 러닝 카운터가
    계속 누적되어 달이 바뀌어도 Hard Cap 이 영구 차단으로 남는다.

    전체 요청 경로에서 호출되므로 원장을 합산하지 않는다(핫패스). 캐시 정확성은
    단일 트랜잭션 계량과 /finops/reconcile 이 보장한다.
    """
    if tenant is None:
        return Decimal("0.00")
    from app.core.billing_period import current_month

    stored = getattr(tenant, "spent_period_month", None)
    if stored and stored != current_month(now):
        return Decimal("0.00")
    return Decimal(str(tenant.spent_budget_krw or 0))


def _roll_tenant_period(tenant: Tenant, now: datetime) -> None:
    """결산월이 바뀌었으면 캐시를 0 으로 되돌린다 (첫 쓰기 시 자기 치유)."""
    from app.core.billing_period import current_month

    month = current_month(now)
    if getattr(tenant, "spent_period_month", None) != month:
        tenant.spent_budget_krw = Decimal("0.00")
        tenant.spent_period_month = month


def _roll_key_period(key: VirtualKey, now: datetime) -> None:
    """가상키 캐시도 테넌트와 동일 규칙으로 결산월 경계에서 되돌린다."""
    from app.core.billing_period import current_month

    month = current_month(now)
    if getattr(key, "spent_period_month", None) != month:
        key.spent_krw = Decimal("0.00")
        key.total_tokens = 0
        key.spent_period_month = month


def record_usage(
    db: Session,
    *,
    key: Optional[VirtualKey] = None,
    tenant: Optional[Tenant] = None,
    model_entry: Optional[Any] = None,
    model_id: Optional[str] = None,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    request_count: int = 1,
    cache_hit: bool = False,
    cache_saved_krw: float = 0.0,
    occurred_at: Optional[datetime] = None,
) -> UsageRecord:
    """
    토큰 사용량을 원장에 기록하고 읽기 캐시를 갱신한다.

    원장 upsert 와 캐시 갱신을 **단일 트랜잭션**으로 커밋한다. 부분 실패가 발생하면
    전부 롤백되므로 '원장에는 있는데 캐시에는 없는' 영구 불일치가 생기지 않는다.
    Redis 는 이 경로에서 건드리지 않는다.
    """
    prompt_tokens = max(0, int(prompt_tokens or 0))
    completion_tokens = max(0, int(completion_tokens or 0))
    total_tokens = prompt_tokens + completion_tokens

    input_price, output_price, _discount = resolve_pricing(db, model_entry)
    cost_krw = compute_cost(prompt_tokens, completion_tokens, input_price, output_price)
    cost_decimal = Decimal(str(cost_krw))

    now = occurred_at or datetime.now(timezone.utc)
    ledger_date = now.date()

    effective_model = (
        model_id
        or (getattr(model_entry, "model_id", None) if model_entry is not None else None)
        or UNATTRIBUTED_MODEL
    )
    effective_tenant = (
        (tenant.tenant_id if tenant is not None else None)
        or (key.tenant_id if key is not None else None)
        or UNATTRIBUTED_TENANT
    )
    effective_key = (key.key_id if key is not None else None) or UNATTRIBUTED_KEY

    record = UsageRecord(
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        cost_krw=cost_krw,
        input_price_per_1k=input_price,
        output_price_per_1k=output_price,
        tenant_id=tenant.tenant_id if tenant is not None else (key.tenant_id if key is not None else None),
        tenant_name=tenant.name if tenant is not None else None,
        key_id=key.key_id if key is not None else None,
        model_id=effective_model if effective_model != UNATTRIBUTED_MODEL else model_id,
        ledger_date=ledger_date,
        cache_hit=cache_hit,
        cache_saved_krw=round(max(0.0, cache_saved_krw), 2),
    )

    if total_tokens == 0 and not cache_hit:
        # 기록할 것이 없으면 트랜잭션을 열지 않는다.
        return record

    try:
        # 1. 기록 원장 upsert (SSOT)
        row = (
            db.query(DailyTokenLedger)
            .filter(
                DailyTokenLedger.date == ledger_date,
                DailyTokenLedger.tenant_id == effective_tenant,
                DailyTokenLedger.model_id == effective_model,
                DailyTokenLedger.key_id == effective_key,
            )
            .first()
        )
        if row is None:
            row = DailyTokenLedger(
                date=ledger_date,
                tenant_id=effective_tenant,
                model_id=effective_model,
                key_id=effective_key,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                cost_krw=cost_decimal,
                request_count=request_count,
                cache_hit_count=1 if cache_hit else 0,
                cache_saved_krw=Decimal(str(record.cache_saved_krw)),
            )
            db.add(row)
        else:
            row.prompt_tokens = (row.prompt_tokens or 0) + prompt_tokens
            row.completion_tokens = (row.completion_tokens or 0) + completion_tokens
            row.total_tokens = (row.total_tokens or 0) + total_tokens
            row.cost_krw = (row.cost_krw or Decimal("0.00")) + cost_decimal
            row.request_count = (row.request_count or 0) + request_count
            if cache_hit:
                row.cache_hit_count = (row.cache_hit_count or 0) + 1
            row.cache_saved_krw = (row.cache_saved_krw or Decimal("0.00")) + Decimal(str(record.cache_saved_krw))

        # 2. 읽기 캐시 갱신 (원장과 동일 트랜잭션)
        if key is not None:
            _roll_key_period(key, now)
            key.total_tokens = (key.total_tokens or 0) + total_tokens
            key.spent_krw = (key.spent_krw or Decimal("0.00")) + cost_decimal
        if tenant is not None:
            _roll_tenant_period(tenant, now)
            tenant.spent_budget_krw = (tenant.spent_budget_krw or Decimal("0.00")) + cost_decimal

        db.commit()
    except Exception as e:
        db.rollback()
        record.persisted = False
        logger.error(
            "FinOps 계량 기록 실패 (tenant=%s, key=%s, model=%s, tokens=%d): %s",
            effective_tenant, effective_key, effective_model, total_tokens, e,
            exc_info=True,
        )
        return record

    # 3. 커밋 이후 best-effort 캐시 리프레시 (실패 무해)
    try:
        if key is not None:
            db.refresh(key)
        if tenant is not None:
            db.refresh(tenant)
    except Exception:
        pass

    return record
