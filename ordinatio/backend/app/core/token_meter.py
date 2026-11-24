"""Token Metering & Daily Accumulation Engine.

Provides dual-layer (Redis In-Memory + PostgreSQL DailyTokenLedger) tracking
of actual prompt, completion, and total tokens consumed per day.
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
    """Record token consumption in Redis fast counter and persistent DailyTokenLedger.

    Returns the updated global token count for today.
    """
    total_tokens = max(0, prompt_tokens + completion_tokens)
    t_id = str(tenant_id or "global").strip() or "global"
    m_id = str(model_id or "default").strip() or "default"
    now_utc = datetime.now(timezone.utc)
    today = now_utc.date()
    today_str = today.strftime("%Y-%m-%d")

    # 1. Fast In-Memory Redis counter (< 0.2ms)
    redis_daily_total: Optional[int] = None
    client = get_redis_client()
    if client:
        try:
            global_key = f"ordinatio:tokens:daily:{today_str}"
            redis_daily_total = client.incrby(global_key, total_tokens)
            client.expire(global_key, 86400 * 3)

            tenant_key = f"ordinatio:tokens:daily:{today_str}:{t_id}"
            client.incrby(tenant_key, total_tokens)
            client.expire(tenant_key, 86400 * 3)
        except Exception as e:
            logger.debug(f"Redis daily token increment bypassed: {e}")

    # 2. Persistent DailyTokenLedger UPSERT in Database
    try:
        row = (
            db.query(DailyTokenLedger)
            .filter(
                DailyTokenLedger.date == today,
                DailyTokenLedger.tenant_id == t_id,
                DailyTokenLedger.model_id == m_id,
            )
            .first()
        )
        if row:
            row.prompt_tokens = (row.prompt_tokens or 0) + prompt_tokens
            row.completion_tokens = (row.completion_tokens or 0) + completion_tokens
            row.total_tokens = (row.total_tokens or 0) + total_tokens
            row.cost_krw = (row.cost_krw or Decimal("0.00")) + Decimal(str(round(cost_krw, 2)))
            row.request_count = (row.request_count or 0) + 1
        else:
            row = DailyTokenLedger(
                date=today,
                tenant_id=t_id,
                model_id=m_id,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                cost_krw=Decimal(str(round(cost_krw, 2))),
                request_count=1,
            )
            db.add(row)
        db.commit()
    except Exception as e:
        logger.warning(f"DailyTokenLedger persistence commit failed: {e}")
        db.rollback()

    if redis_daily_total is not None:
        return redis_daily_total

    return get_today_total_tokens(db)


def get_today_total_tokens(db: Session) -> int:
    """Retrieve actual cumulative tokens consumed today across all tenants and models."""
    now_utc = datetime.now(timezone.utc)
    today = now_utc.date()
    today_str = today.strftime("%Y-%m-%d")

    # 1. Check Redis cache first (Fast Path)
    client = get_redis_client()
    if client:
        try:
            val = client.get(f"ordinatio:tokens:daily:{today_str}")
            if val is not None:
                return int(val)
        except Exception:
            pass

    # 2. Fallback to SQL Database (Aggregate Path)
    try:
        total = db.query(func.sum(DailyTokenLedger.total_tokens)).filter(DailyTokenLedger.date == today).scalar()
        daily_total = int(total or 0)

        # Repopulate Redis cache for subsequent fast lookups
        if client:
            try:
                client.setex(f"ordinatio:tokens:daily:{today_str}", 86400 * 3, daily_total)
            except Exception:
                pass
        return daily_total
    except Exception as e:
        logger.warning(f"Failed to query daily token total from DB: {e}")
        return 0


def get_today_total_cost(db: Session) -> float:
    """Retrieve actual cumulative inference cost (KRW) incurred today from PostgreSQL DailyTokenLedger."""
    now_utc = datetime.now(timezone.utc)
    today = now_utc.date()
    try:
        total = db.query(func.sum(DailyTokenLedger.cost_krw)).filter(DailyTokenLedger.date == today).scalar()
        if total is not None:
            return float(total)
    except Exception as e:
        logger.warning(f"Failed to query daily total cost from DailyTokenLedger: {e}")

    # Fallback to sum of spent_budget_krw from Tenant table if daily ledger has no records yet
    try:
        from app.models.tenant import Tenant
        tenant_total = db.query(func.sum(Tenant.spent_budget_krw)).scalar()
        return float(tenant_total) if tenant_total is not None else 0.0
    except Exception as e:
        logger.warning(f"Fallback tenant cost query failed: {e}")
        return 0.0
