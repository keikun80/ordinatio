"""Canary & Failover Routing Engine for Envoy AI Gateway.

Provides helper routines for:
1. Building failover model attempts based on RoutingPolicy (primary -> failover_model_id -> failover_chain).
2. Tracking canary model error rates and triggering automatic weight rollback when errors exceed thresholds.
3. Managing consecutive error counters in Redis and in-memory fallback.
"""
from __future__ import annotations

import logging
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session

from app.core.token_meter import get_redis_client
from app.core.xds_generator import generate_xds_revision
from app.models.model_catalog import ModelCatalog
from app.models.routing_policy import RoutingPolicy
from app.models.audit_log import AuditLog

logger = logging.getLogger("canary_failover")

# In-memory fallback error tracking if Redis is unreachable
_MEMORY_ERROR_COUNTERS: Dict[str, int] = {}
CONSECUTIVE_ERROR_THRESHOLD = 5


def get_candidate_model_chain(
    primary_model_id: str,
    db_policy: Optional[RoutingPolicy],
    db: Session
) -> List[Tuple[str, Optional[ModelCatalog]]]:
    """Build ordered list of (model_id, ModelCatalog) to attempt:
    [primary, failover_model_id, *failover_chain]
    Deduplicating while preserving order.
    """
    model_ids: List[str] = [primary_model_id]

    if db_policy:
        if db_policy.failover_model_id:
            model_ids.append(db_policy.failover_model_id)
        if db_policy.failover_chain and isinstance(db_policy.failover_chain, list):
            for f_id in db_policy.failover_chain:
                if f_id and isinstance(f_id, str):
                    model_ids.append(f_id)

    # De-duplicate preserving order
    dedup_ids: List[str] = list(dict.fromkeys(model_ids))

    result: List[Tuple[str, Optional[ModelCatalog]]] = []
    for m_id in dedup_ids:
        entry = db.query(ModelCatalog).filter(
            (ModelCatalog.model_id == m_id) | (ModelCatalog.alias == m_id)
        ).first()
        result.append((m_id, entry))

    return result


def record_canary_error(
    route_name: str,
    model_id: str,
    db_policy: Optional[RoutingPolicy],
    db: Session
) -> bool:
    """Record a failure for a canary model.
    If consecutive errors reach CONSECUTIVE_ERROR_THRESHOLD, trigger auto-rollback:
    revert traffic_weights to 100% on the primary model, bump xDS revision, and log audit.
    Returns True if auto-rollback was triggered, False otherwise.
    """
    if not db_policy or not db_policy.traffic_weights:
        return False

    weights: List[Dict[str, Any]] = db_policy.traffic_weights
    if len(weights) <= 1:
        # Not a canary route with traffic split
        return False

    # Check if this model is a canary target (not the only one, or weight < 100)
    target_item = next((w for w in weights if w.get("model_id") == model_id), None)
    if not target_item or target_item.get("weight", 0) >= 100:
        return False

    key = f"ordinatio:canary:consecutive_errors:{route_name}:{model_id}"
    redis_client = get_redis_client()
    consecutive_errors = 0

    if redis_client:
        try:
            consecutive_errors = int(redis_client.incr(key))
            redis_client.expire(key, 3600)
        except Exception as e:
            logger.warning(f"Redis canary error incr failed: {e}")
            consecutive_errors = _increment_memory_counter(key)
    else:
        consecutive_errors = _increment_memory_counter(key)

    logger.warning(
        f"Canary error recorded for route='{route_name}', model='{model_id}': "
        f"{consecutive_errors}/{CONSECUTIVE_ERROR_THRESHOLD} consecutive errors"
    )

    if consecutive_errors >= CONSECUTIVE_ERROR_THRESHOLD:
        return execute_canary_auto_rollback(
            route_name=route_name,
            canary_model_id=model_id,
            consecutive_errors=consecutive_errors,
            db_policy=db_policy,
            db=db
        )

    return False


def record_canary_success(
    route_name: str,
    model_id: str
) -> None:
    """Reset consecutive error counter on a successful invocation."""
    key = f"ordinatio:canary:consecutive_errors:{route_name}:{model_id}"
    redis_client = get_redis_client()
    if redis_client:
        try:
            redis_client.delete(key)
        except Exception as e:
            logger.warning(f"Redis canary error reset failed: {e}")
    _MEMORY_ERROR_COUNTERS.pop(key, None)


def execute_canary_auto_rollback(
    route_name: str,
    canary_model_id: str,
    consecutive_errors: int,
    db_policy: RoutingPolicy,
    db: Session
) -> bool:
    """Roll back canary route weights back to 100% on the primary model."""
    weights: List[Dict[str, Any]] = db_policy.traffic_weights or []
    if not weights:
        return False

    # Find primary model (highest weight other than the failing canary, or first non-canary)
    other_models = [w for w in weights if w.get("model_id") != canary_model_id]
    if not other_models:
        return False

    other_models.sort(key=lambda w: w.get("weight", 0), reverse=True)
    primary_model_id = other_models[0].get("model_id")

    # Set primary to 100, canary to 0 (or remove)
    new_weights = [{"model_id": primary_model_id, "weight": 100}]

    old_weights_repr = str(db_policy.traffic_weights)
    new_revision = generate_xds_revision()

    db_policy.traffic_weights = new_weights
    db_policy.xds_revision = new_revision
    db_policy.deployed_by = "auto-rollback-system"

    # Reset counter
    record_canary_success(route_name, canary_model_id)

    try:
        import time
        log_id = f"audit-rollback-{int(time.time()*1000)}"
        audit = AuditLog(
            log_id=log_id,
            requester_id="auto-rollback-system",
            key_id="system-gateway",
            model_id=canary_model_id,
            original_prompt_hash="CANARY_AUTO_ROLLBACK",
            masked_payload_hash="CANARY_AUTO_ROLLBACK",
            detections_json=f'{{"reason": "Consecutive errors exceeded threshold ({consecutive_errors})", "old_weights": "{old_weights_repr}", "new_weights": "{new_weights}", "route": "{route_name}"}}',
            pii_count=0,
            action_taken="CANARY_ROLLBACK",
            latency_ms=0,
            is_blocked=False
        )
        db.add(audit)
        db.commit()
        db.refresh(db_policy)
        logger.error(
            f"ALERT [CANARY AUTO-ROLLBACK]: Route '{route_name}' canary model '{canary_model_id}' "
            f"exceeded {consecutive_errors} consecutive errors! Reverted traffic_weights to 100% on '{primary_model_id}'. "
            f"New xDS revision: {new_revision}"
        )
        return True
    except Exception as commit_err:
        db.rollback()
        logger.error(f"Failed to persist canary auto-rollback: {commit_err}")
        return False


def _increment_memory_counter(key: str) -> int:
    val = _MEMORY_ERROR_COUNTERS.get(key, 0) + 1
    _MEMORY_ERROR_COUNTERS[key] = val
    return val
