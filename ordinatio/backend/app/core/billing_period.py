"""회계 결산 기간 산출.

당월 지출을 러닝 카운터가 아니라 '원장의 날짜 범위 합계'로 파생시키기 위한 경계 계산.
이 방식이라 월 경계가 자동 처리되고(월간 리셋 크론 불필요), 과거 월 청구서를 실제
그 달의 수치로 생성할 수 있다.
"""
from __future__ import annotations

import calendar
import re
from datetime import date, datetime, timezone
from typing import Tuple

MONTH_RE = re.compile(r"^(\d{4})-(\d{2})$")


class InvalidBillingMonth(ValueError):
    pass


def current_month(now: datetime | None = None) -> str:
    n = now or datetime.now(timezone.utc)
    return n.strftime("%Y-%m")


def parse_month(month: str | None, now: datetime | None = None) -> str:
    """'YYYY-MM' 검증. None 이면 당월."""
    if not month:
        return current_month(now)
    m = MONTH_RE.match(month.strip())
    if not m:
        raise InvalidBillingMonth(f"결산월 형식이 올바르지 않습니다(YYYY-MM): {month}")
    year, mon = int(m.group(1)), int(m.group(2))
    if not (1 <= mon <= 12) or not (2000 <= year <= 2999):
        raise InvalidBillingMonth(f"결산월 범위가 올바르지 않습니다: {month}")
    return f"{year:04d}-{mon:02d}"


def period_range(month: str | None = None, now: datetime | None = None) -> Tuple[date, date]:
    """해당 결산월의 [시작일, 종료일] (양끝 포함)."""
    normalized = parse_month(month, now)
    year, mon = int(normalized[:4]), int(normalized[5:7])
    last_day = calendar.monthrange(year, mon)[1]
    return date(year, mon, 1), date(year, mon, last_day)


def elapsed_days_in_period(month: str | None = None, now: datetime | None = None) -> int:
    """해당 결산월에서 경과한 일수 (Run Rate 예측용). 과거 월이면 그 달의 총 일수."""
    n = now or datetime.now(timezone.utc)
    start, end = period_range(month, n)
    today = n.date()
    if today < start:
        return 0
    if today > end:
        return (end - start).days + 1
    return (today - start).days + 1


def days_in_period(month: str | None = None, now: datetime | None = None) -> int:
    start, end = period_range(month, now)
    return (end - start).days + 1
