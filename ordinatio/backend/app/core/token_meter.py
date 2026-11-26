"""Token Rate Limiting & Daily Aggregation Read Helpers.

과금 기록은 본 모듈이 아니라 app/core/metering.record_usage 단일 경로가 담당한다.
본 모듈은 (1) 레이트리밋용 Redis 클라이언트 제공, (2) 일일 집계 조회만 담당한다.

Redis 는 과금 경로에서 제거되었다. 이전에는 get_today_total_tokens 가 Redis 를
1순위로 읽어 PostgreSQL 을 아예 조회하지 않았고, record_daily_tokens 가 Redis incr
성공 후 DB 커밋 실패 시 rollback 하여 Redis 만 증가한 영구 불일치가 발생했다.
일일 집계의 SSOT 는 PostgreSQL 의 DailyTokenLedger 이다.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

import redis
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.daily_token_ledger import DailyTokenLedger

logger = logging.getLogger("token_meter")

_redis_client: Optional[redis.Redis] = None
_redis_unavailable = False


def get_redis_client() -> Optional[redis.Redis]:
    global _redis_client, _redis_unavailable
    if _redis_unavailable:
        return None
    if _redis_client is None:
        try:
            _redis_client = redis.Redis(
                host=settings.REDIS_HOST,
                port=settings.REDIS_PORT,
                decode_responses=True,
                socket_connect_timeout=0.08,
                socket_timeout=0.08,
            )
            _redis_client.ping()
        except Exception:
            _redis_unavailable = True
            _redis_client = None
    return _redis_client


def record_daily_tokens(
    db: Session,
    tenant_id: Optional[str],
    model_id: Optional[str],
    prompt_tokens: int,
    completion_tokens: int,
    cost_krw: float = 0.0,
) -> int:
    """
    [하위호환 shim] 기존 호출부를 위해 유지한다. 실제 기록은 metering.record_usage 가 수행한다.

    주의: 본 shim 은 가상키를 특정할 수 없으므로 원장의 key_id 가 'none' 으로 기록되고
    VirtualKey 캐시는 갱신되지 않는다. 신규 호출부는 metering.record_usage 를 직접 쓸 것.
    cost_krw 인자는 더 이상 사용하지 않는다(단가는 metering 이 SSOT 에서 산출).
    """
    from app.core.metering import record_usage
    from app.models.tenant import Tenant

    tenant = None
    if tenant_id:
        tenant = db.query(Tenant).filter(Tenant.tenant_id == tenant_id).first()

    record_usage(
        db=db,
        key=None,
        tenant=tenant,
        model_entry=None,
        model_id=model_id,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
    )
    return get_today_total_tokens(db)


def get_today_total_tokens(db: Session) -> int:
    """당일 누적 토큰 조회. SSOT 는 PostgreSQL 의 DailyTokenLedger 이다.

    Redis 조회를 1순위로 두지 않는다. Redis 를 먼저 읽으면 TTL 만료/eviction/재시작 시
    수치가 점프하고, DB 합계를 setex 로 덮어쓰면 다른 워커의 incrby 와 경쟁해
    lost update 가 발생한다. 원장 PK 선두가 date 이므로 당일 범위 집계는 저렴하다.
    """
    today = datetime.now(timezone.utc).date()
    try:
        total = db.query(func.sum(DailyTokenLedger.total_tokens)).filter(DailyTokenLedger.date == today).scalar()
        return int(total or 0)
    except Exception as e:
        logger.warning(f"Failed to query daily token total from DB: {e}")
        return 0


def get_today_total_cost(db: Session) -> float:
    """당일 누적 추론 비용(KRW) 조회. SSOT 는 DailyTokenLedger 이다.

    원장이 비어 있으면 0.0 이 정답이다. 이전 구현은 sum(Tenant.spent_budget_krw),
    즉 '월 누적 전사 지출'을 '오늘 비용'으로 반환해 단위가 다른 값을 섞었다.
    """
    today = datetime.now(timezone.utc).date()
    try:
        total = db.query(func.sum(DailyTokenLedger.cost_krw)).filter(DailyTokenLedger.date == today).scalar()
        return float(total or 0.0)
    except Exception as e:
        logger.warning(f"Failed to query daily total cost from DailyTokenLedger: {e}")
        return 0.0
