"""FinOps 표준 단가 SSOT.

이전에는 단가가 네 곳에 분산되어 같은 추론이 경로에 따라 다르게 과금되었다:
  * gateway.py          -> ModelCatalog (DB)
  * external.py         -> 0.0008 / 0.0024 하드코딩
  * finops.py           -> 0.80 / 2.40 / 0.25 상수
  * FinOpsTab.jsx       -> modelPricings[0] (모델 목록 '첫 행'을 표준 단가로 표시)

본 모듈이 표준 단가의 단일 공급원이며, 값은 PostgreSQL 의 system_settings 테이블
(`finops_pricing` 키)에 보관한다. 모델별 단가는 ModelCatalog 로 오버라이드한다.
"""
from __future__ import annotations

import logging
from typing import Any, Dict

from sqlalchemy.orm import Session

logger = logging.getLogger("finops_pricing")

PRICING_SETTING_KEY = "finops_pricing"

# system_settings 에 값이 없을 때만 쓰이는 최후 기본값.
# 운영 시드(app/db/system_settings_seed.py)가 동일 값을 DB 에 심는다.
DEFAULT_PRICING: Dict[str, Any] = {
    "currency": "KRW",
    "input_per_1k": 0.80,
    "output_per_1k": 2.40,
    "cache_discount_ratio": 0.25,
}


def get_standard_pricing(db: Session) -> Dict[str, Any]:
    """system_settings 에서 표준 단가를 읽는다. 누락 키는 기본값으로 메운다."""
    merged = dict(DEFAULT_PRICING)
    try:
        from app.models.system_setting import SystemSetting

        row = db.query(SystemSetting).filter(SystemSetting.key == PRICING_SETTING_KEY).first()
        if row and isinstance(row.value, dict):
            for k in ("currency", "input_per_1k", "output_per_1k", "cache_discount_ratio"):
                if k in row.value and row.value[k] is not None:
                    merged[k] = row.value[k]
    except Exception as e:
        logger.warning("표준 단가 조회 실패, 기본값 사용: %s", e)

    merged["input_per_1k"] = float(merged["input_per_1k"])
    merged["output_per_1k"] = float(merged["output_per_1k"])
    merged["cache_discount_ratio"] = float(merged["cache_discount_ratio"])
    return merged


def set_standard_pricing(db: Session, payload: Dict[str, Any]) -> Dict[str, Any]:
    """표준 단가를 갱신한다. 전달된 키만 부분 반영한다."""
    from app.models.system_setting import SystemSetting

    current = get_standard_pricing(db)
    for k in ("currency", "input_per_1k", "output_per_1k", "cache_discount_ratio"):
        if payload.get(k) is not None:
            current[k] = payload[k]

    row = db.query(SystemSetting).filter(SystemSetting.key == PRICING_SETTING_KEY).first()
    if row:
        row.value = current
        row.category = "finops"
    else:
        db.add(SystemSetting(
            key=PRICING_SETTING_KEY,
            category="finops",
            description="FinOps 표준 토큰 단가 (모델별 단가는 ModelCatalog 가 오버라이드)",
            value=current,
        ))
    db.commit()
    return get_standard_pricing(db)
