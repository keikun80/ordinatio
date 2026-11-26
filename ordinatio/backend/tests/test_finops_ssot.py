"""FinOps SSOT 회귀 테스트.

기존 test_finops_observability.py 8건은 통과하면서도 다음 결함을 놓쳤다:
  * CSV 의 month 파라미터가 라벨 전용이었음 (2020-01 청구서에 현재 누적치)
  * external/usage/report 경로가 DailyTokenLedger 를 갱신하지 않았음
  * Hard Cap 이 러닝 카운터 기준이라 달이 바뀌어도 영구 차단
  * 표준 단가가 코드 상수라 운영자가 바꿀 수 없었고 테스트가 그 상수를 단정
  * Redis 분기가 테스트 환경에 Redis 가 없어 한 번도 실행되지 않았음
  * Prometheus(VirtualKey.spent_krw) 와 FinOps 콘솔(Tenant.spent_budget_krw) 이 다른 값

본 모듈은 그 경로들을 실제로 실행해 고정한다.
"""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func

from app.main import app
from app.models.daily_token_ledger import DailyTokenLedger
from app.models.tenant import Tenant
from app.models.virtual_key import VirtualKey
from app.core.security import hash_virtual_key
from tests.conftest import TestSessionLocal

client = TestClient(app)

PROBE_KEY = "vk-ssot-test"
PROBE_TENANT = "dept-ssot-test"


def _reset_fixture():
    """계량 검증용 전용 테넌트/키를 깨끗한 상태로 준비한다."""
    with TestSessionLocal() as db:
        db.query(DailyTokenLedger).filter(DailyTokenLedger.tenant_id == PROBE_TENANT).delete()
        db.query(VirtualKey).filter(VirtualKey.key_id == PROBE_KEY).delete()
        db.query(Tenant).filter(Tenant.tenant_id == PROBE_TENANT).delete()
        db.add(Tenant(
            tenant_id=PROBE_TENANT,
            name="SSOT 검증부",
            department_code="SSOT-01",
            monthly_budget_krw=Decimal("1000000.00"),
            spent_budget_krw=Decimal("0.00"),
            is_hard_cap_enabled=True,
        ))
        db.add(VirtualKey(
            key_id=PROBE_KEY,
            name="SSOT 검증 키",
            key_hash=hash_virtual_key("sk-ord-ssot-test-key-01"),
            key_prefix="sk-ord-ssot-tes",
            tenant_id=PROBE_TENANT,
            tpm_limit=50000,
            is_active=True,
        ))
        db.commit()


def _teardown_fixture():
    with TestSessionLocal() as db:
        db.query(DailyTokenLedger).filter(DailyTokenLedger.tenant_id == PROBE_TENANT).delete()
        db.query(VirtualKey).filter(VirtualKey.key_id == PROBE_KEY).delete()
        db.query(Tenant).filter(Tenant.tenant_id == PROBE_TENANT).delete()
        db.commit()


def _probe_sums():
    with TestSessionLocal() as db:
        tenant = db.query(Tenant).filter(Tenant.tenant_id == PROBE_TENANT).first()
        key = db.query(VirtualKey).filter(VirtualKey.key_id == PROBE_KEY).first()
        ledger_cost = db.query(func.coalesce(func.sum(DailyTokenLedger.cost_krw), 0)).filter(
            DailyTokenLedger.tenant_id == PROBE_TENANT
        ).scalar()
        ledger_tok = db.query(func.coalesce(func.sum(DailyTokenLedger.total_tokens), 0)).filter(
            DailyTokenLedger.tenant_id == PROBE_TENANT
        ).scalar()
        return {
            "tenant_cost": float(tenant.spent_budget_krw or 0),
            "key_cost": float(key.spent_krw or 0),
            "ledger_cost": float(ledger_cost or 0),
            "key_tokens": int(key.total_tokens or 0),
            "ledger_tokens": int(ledger_tok or 0),
        }


@pytest.fixture(autouse=True)
def _fixture_lifecycle():
    _reset_fixture()
    yield
    _teardown_fixture()


# ---------------------------------------------------------------------------
# 1. 교차 소스 일관성
# ---------------------------------------------------------------------------

def test_external_usage_report_updates_ledger_and_caches_consistently():
    """
    external/usage/report 경로가 원장과 캐시를 모두 갱신해야 한다.
    회귀 배경: 이 경로가 record_daily_tokens 를 호출하지 않아 사용량이 일/월 집계에서
    영구 누락됐다 (실측: 원장 +0, 캐시 +32).
    """
    res = client.post("/api/v1/external/usage/report", json={
        "key_id": PROBE_KEY, "prompt_tokens": 10000, "completion_tokens": 10000,
    })
    assert res.status_code == 200, res.text

    s = _probe_sums()
    assert s["ledger_cost"] > 0, "원장이 갱신되지 않았습니다"
    assert s["tenant_cost"] == s["key_cost"] == s["ledger_cost"]
    assert s["key_tokens"] == s["ledger_tokens"] == 20000

    # 원장에 key_id 가 기록되어야 키 단위 복구가 가능하다
    with TestSessionLocal() as db:
        rows = db.query(DailyTokenLedger).filter(DailyTokenLedger.tenant_id == PROBE_TENANT).all()
        assert any(r.key_id == PROBE_KEY for r in rows), [r.key_id for r in rows]


def test_metering_is_atomic_across_ledger_and_caches():
    """계량은 단일 트랜잭션이어야 한다 — 부분 실패 시 4개 카운터가 모두 롤백된다."""
    from app.core import metering

    before = _probe_sums()

    with TestSessionLocal() as db:
        tenant = db.query(Tenant).filter(Tenant.tenant_id == PROBE_TENANT).first()
        key = db.query(VirtualKey).filter(VirtualKey.key_id == PROBE_KEY).first()

        original_commit = db.commit
        def boom():
            raise RuntimeError("simulated commit failure")
        db.commit = boom
        try:
            record = metering.record_usage(
                db=db, key=key, tenant=tenant, model_entry=None,
                prompt_tokens=5000, completion_tokens=5000,
            )
        finally:
            db.commit = original_commit

    assert record.persisted is False
    after = _probe_sums()
    assert after == before, f"부분 반영이 발생했습니다: {before} -> {after}"


def test_prometheus_and_finops_overview_report_same_total():
    """Prometheus 와 FinOps 콘솔이 같은 '누적 비용'을 보고해야 한다."""
    client.post("/api/v1/external/usage/report", json={
        "key_id": PROBE_KEY, "prompt_tokens": 50000, "completion_tokens": 50000,
    })

    overview = client.get("/api/v1/finops/overview").json()
    metrics_text = client.get("/metrics").text

    prom_cost = None
    for line in metrics_text.splitlines():
        if line.startswith("ordinatio_cost_total_krw "):
            prom_cost = float(line.split()[1])
    assert prom_cost is not None, metrics_text

    assert abs(prom_cost - overview["total_spent_krw"]) < 0.01, (
        f"Prometheus={prom_cost} vs overview={overview['total_spent_krw']}"
    )


# ---------------------------------------------------------------------------
# 2. 월 범위 집계
# ---------------------------------------------------------------------------

def test_csv_invoice_reflects_requested_billing_month():
    """
    CSV 가 결산월별로 '다른 금액'을 내보내야 한다.
    회귀 배경: month 가 라벨 전용이라 2020-01 청구서에도 현재 누적치가 담겼고,
    기존 테스트는 `assert "2026-09" in text` 로 라벨만 확인해 통과했다.
    """
    today = datetime.now(timezone.utc).date()
    this_month = today.strftime("%Y-%m")
    prev_anchor = date(today.year, today.month, 1) - timedelta(days=1)
    prev_month = prev_anchor.strftime("%Y-%m")

    with TestSessionLocal() as db:
        db.add(DailyTokenLedger(
            date=prev_anchor, tenant_id=PROBE_TENANT, model_id="m-prev", key_id=PROBE_KEY,
            prompt_tokens=100, completion_tokens=100, total_tokens=200,
            cost_krw=Decimal("111.00"), request_count=1,
        ))
        db.add(DailyTokenLedger(
            date=today, tenant_id=PROBE_TENANT, model_id="m-cur", key_id=PROBE_KEY,
            prompt_tokens=200, completion_tokens=200, total_tokens=400,
            cost_krw=Decimal("222.00"), request_count=1,
        ))
        db.commit()

    def spend_in(csv_text: str) -> str:
        for line in csv_text.splitlines():
            if line.startswith(PROBE_TENANT + ","):
                return line
        raise AssertionError(f"{PROBE_TENANT} 행이 없습니다:\n{csv_text}")

    cur = client.get(f"/api/v1/finops/invoices/export?month={this_month}")
    prev = client.get(f"/api/v1/finops/invoices/export?month={prev_month}")
    assert cur.status_code == prev.status_code == 200

    cur_row, prev_row = spend_in(cur.text), spend_in(prev.text)
    assert "222" in cur_row, cur_row
    assert "111" in prev_row, prev_row
    assert cur_row != prev_row, "결산월이 달라도 동일한 금액이 반환되었습니다"

    assert cur.headers["X-Billing-Month"] == this_month
    assert prev.headers["X-Billing-Month"] == prev_month


def test_invalid_billing_month_is_rejected():
    res = client.get("/api/v1/finops/invoices/export?month=2026-13")
    assert res.status_code == 400
    assert "결산월" in res.json()["detail"]


def test_hard_cap_releases_on_month_rollover():
    """
    지난 달에 예산을 초과했어도 당월 Hard Cap 은 풀려야 한다.
    회귀 배경: spent_budget_krw 가 러닝 카운터이고 월간 리셋 크론이 없어
    한 번 Hard Cap 에 걸리면 영구 차단으로 남았다.
    """
    from app.core.metering import tenant_effective_spend
    from app.core.billing_period import current_month

    today = datetime.now(timezone.utc).date()
    prev_anchor = date(today.year, today.month, 1) - timedelta(days=1)
    prev_month = prev_anchor.strftime("%Y-%m")

    with TestSessionLocal() as db:
        tenant = db.query(Tenant).filter(Tenant.tenant_id == PROBE_TENANT).first()
        # 지난 달에 예산 100% 소진 상태로 캐시가 남아있는 상황
        tenant.spent_budget_krw = Decimal("1000000.00")
        tenant.spent_period_month = prev_month
        db.commit()

        # 당월 기준 유효 지출은 0 이어야 한다 (지난 달 잔재는 무시)
        assert float(tenant_effective_spend(tenant)) == 0.0
        assert tenant.spent_period_month != current_month()

    # 당월 overview 에서도 차단 상태가 아니어야 한다
    overview = client.get("/api/v1/finops/overview").json()
    probe = [t for t in overview["tenants"] if t["tenant_id"] == PROBE_TENANT][0]
    assert probe["is_blocked"] is False
    assert probe["spent_budget_krw"] == 0.0


def test_metering_rolls_period_cache_on_new_month():
    """새 결산월 첫 쓰기에서 캐시가 자기 치유되어야 한다 (크론 없이)."""
    from app.core.billing_period import current_month

    with TestSessionLocal() as db:
        tenant = db.query(Tenant).filter(Tenant.tenant_id == PROBE_TENANT).first()
        tenant.spent_budget_krw = Decimal("999999.00")
        tenant.spent_period_month = "2000-01"
        db.commit()

    res = client.post("/api/v1/external/usage/report", json={
        "key_id": PROBE_KEY, "prompt_tokens": 1000, "completion_tokens": 1000,
    })
    assert res.status_code == 200, res.text

    with TestSessionLocal() as db:
        tenant = db.query(Tenant).filter(Tenant.tenant_id == PROBE_TENANT).first()
        assert tenant.spent_period_month == current_month()
        # 999999 가 이어지지 않고 당월 분만 남아야 한다
        assert float(tenant.spent_budget_krw) < 100.0


# ---------------------------------------------------------------------------
# 3. 단가 SSOT
# ---------------------------------------------------------------------------

def test_standard_pricing_is_configurable_and_drives_overview():
    """
    표준 단가가 설정값에서 와야 한다.
    회귀 배경: 코드 상수(0.80/2.40)였고 기존 테스트가 `== 0.80` 을 단정해
    '설정 기능이 없다'는 사실을 테스트가 고정하고 있었다.
    """
    original = client.get("/api/v1/finops/pricing").json()
    try:
        patched = client.patch("/api/v1/finops/pricing", json={
            "input_per_1k": 1.23, "output_per_1k": 4.56, "cache_discount_ratio": 0.5,
        })
        assert patched.status_code == 200, patched.text
        assert patched.json()["input_per_1k"] == 1.23

        overview = client.get("/api/v1/finops/overview").json()
        pm = overview["pricing_matrix"]
        assert pm["standard_input_per_1k"] == 1.23
        assert pm["standard_output_per_1k"] == 4.56
        assert pm["standard_cache_discount"] == 0.5
    finally:
        client.patch("/api/v1/finops/pricing", json={
            "input_per_1k": original["input_per_1k"],
            "output_per_1k": original["output_per_1k"],
            "cache_discount_ratio": original["cache_discount_ratio"],
        })


def test_metering_uses_configured_pricing_when_model_has_no_override():
    """모델 단가가 없으면 설정된 표준 단가로 과금해야 한다 (하드코딩 제거 확인)."""
    from app.core.metering import record_usage

    original = client.get("/api/v1/finops/pricing").json()
    try:
        client.patch("/api/v1/finops/pricing", json={"input_per_1k": 10.0, "output_per_1k": 20.0})
        with TestSessionLocal() as db:
            tenant = db.query(Tenant).filter(Tenant.tenant_id == PROBE_TENANT).first()
            key = db.query(VirtualKey).filter(VirtualKey.key_id == PROBE_KEY).first()
            rec = record_usage(
                db=db, key=key, tenant=tenant, model_entry=None, model_id="no-such-model",
                prompt_tokens=1000, completion_tokens=1000,
            )
        # 1000/1k * 10 + 1000/1k * 20 = 30
        assert rec.cost_krw == 30.0, rec.cost_krw
    finally:
        client.patch("/api/v1/finops/pricing", json={
            "input_per_1k": original["input_per_1k"],
            "output_per_1k": original["output_per_1k"],
        })


# ---------------------------------------------------------------------------
# 4. 드리프트 탐지 및 정합화
# ---------------------------------------------------------------------------

def test_drift_is_detected_and_reconciled_from_ledger():
    client.post("/api/v1/external/usage/report", json={
        "key_id": PROBE_KEY, "prompt_tokens": 10000, "completion_tokens": 10000,
    })

    # 캐시를 인위적으로 틀리게 만든다 (운영자 직접 수정 / 과거 데이터 상황)
    with TestSessionLocal() as db:
        tenant = db.query(Tenant).filter(Tenant.tenant_id == PROBE_TENANT).first()
        tenant.spent_budget_krw = Decimal("55555.00")
        db.commit()

    drift = client.get("/api/v1/finops/drift").json()
    assert drift["total_drift_krw"] > 0
    assert any(d["tenant_id"] == PROBE_TENANT for d in drift["details"])

    overview = client.get("/api/v1/finops/overview").json()
    assert overview["cache_drift_krw"] > 0
    probe = [t for t in overview["tenants"] if t["tenant_id"] == PROBE_TENANT][0]
    # overview 의 지출은 원장(SSOT) 기준이어야 한다
    assert probe["spent_budget_krw"] != 55555.0
    assert probe["cached_spent_krw"] == 55555.0

    # dry-run 은 쓰지 않는다
    dry = client.post("/api/v1/finops/reconcile?apply=false").json()
    assert dry["applied"] is False
    with TestSessionLocal() as db:
        t = db.query(Tenant).filter(Tenant.tenant_id == PROBE_TENANT).first()
        assert float(t.spent_budget_krw) == 55555.0

    applied = client.post("/api/v1/finops/reconcile").json()
    assert applied["applied"] is True
    assert client.get("/api/v1/finops/drift").json()["total_drift_krw"] == 0.0


def test_backfill_requires_explicit_confirmation():
    """회계 수치를 바꾸는 이관은 confirm=true 없이는 실행되지 않아야 한다."""
    res = client.post("/api/v1/finops/backfill-legacy-counter")
    assert res.status_code == 400
    assert "회계 수치" in res.json()["detail"]


# ---------------------------------------------------------------------------
# 5. Redis 분기 (스텁으로 실제 실행)
# ---------------------------------------------------------------------------

def test_daily_totals_come_from_postgres_not_redis(monkeypatch):
    """
    일일 집계의 SSOT 는 PostgreSQL 이어야 한다.
    회귀 배경: get_today_total_tokens 가 Redis 를 1순위로 읽어 DB 를 아예 조회하지 않아,
    Redis TTL 만료/eviction/재시작 시 수치가 점프했다.
    """
    from tests.fakes.redis_stub import FakeRedis
    from app.core import token_meter

    fake = FakeRedis()
    monkeypatch.setattr(token_meter, "get_redis_client", lambda: fake)

    client.post("/api/v1/external/usage/report", json={
        "key_id": PROBE_KEY, "prompt_tokens": 7000, "completion_tokens": 3000,
    })

    with TestSessionLocal() as db:
        db_total = token_meter.get_today_total_tokens(db)

    # Redis 에 엉뚱한 값을 심어도 집계가 흔들리지 않아야 한다
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    fake.set(f"ordinatio:tokens:daily:{today}", 999999999)
    with TestSessionLocal() as db:
        assert token_meter.get_today_total_tokens(db) == db_total


def test_today_total_cost_does_not_fall_back_to_monthly_counter():
    """
    원장이 비면 '오늘 비용'은 0 이어야 한다.
    회귀 배경: 폴백이 sum(Tenant.spent_budget_krw), 즉 '월 누적 전사 지출'을
    '오늘 비용'으로 반환했다 (실측 7,777,777 반환).
    """
    from app.core.token_meter import get_today_total_cost

    today = datetime.now(timezone.utc).date()
    with TestSessionLocal() as db:
        db.query(DailyTokenLedger).filter(DailyTokenLedger.date == today).delete()
        tenant = db.query(Tenant).filter(Tenant.tenant_id == PROBE_TENANT).first()
        tenant.spent_budget_krw = Decimal("7777777.00")
        db.commit()

        assert get_today_total_cost(db) == 0.0


# ---------------------------------------------------------------------------
# 6. Hard Cap 집행 지점
# ---------------------------------------------------------------------------

def test_ext_proc_enforces_hard_cap_with_429():
    """
    Envoy ext_proc 경로도 Hard Cap 을 집행해야 한다.
    회귀 배경: 호출부가 budget_spent_ratio=0.0 / tpm_limit=200000 을 하드코딩해 전달해
    'Envoy L7 에서 즉시 429' 정책이 이 경로에서 전혀 작동하지 않았다.
    """
    from app.core.billing_period import current_month

    with TestSessionLocal() as db:
        tenant = db.query(Tenant).filter(Tenant.tenant_id == PROBE_TENANT).first()
        tenant.spent_budget_krw = tenant.monthly_budget_krw
        tenant.spent_period_month = current_month()
        tenant.is_hard_cap_enabled = True
        db.commit()

    res = client.post("/v1/ext-proc/process", json={
        "headers": {
            "authorization": "Bearer sk-ord-ssot-test-key-01",
            "x-orche-tenant": PROBE_TENANT,
        },
        "body": {"model": "agent-auto", "messages": [{"role": "user", "content": "예산 초과 확인"}]},
    })
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["status"] == "REJECT", data
    assert data["status_code"] == 429, data
    assert "HARD_CAP" in (data.get("reason") or "")


# ---------------------------------------------------------------------------
# 7. 운영 액션과 원장의 정합성
# ---------------------------------------------------------------------------

def test_reset_spent_keeps_ui_enforcement_and_ledger_consistent():
    """
    Hard Cap 긴급 해제(reset-spent)가 UI/집행/원장을 동시에 일치시켜야 한다.

    회귀 배경: 캐시 컬럼만 0 으로 만들던 구현에서는 overview(원장 기준)는 계속 '차단됨'
    으로 보이는데 Hard Cap 집행(캐시 기준)은 통과해, 'UI 는 차단, 트래픽은 허용'
    상태가 되고 드리프트가 -320 으로 남았다.
    """
    from app.core.metering import tenant_effective_spend

    with TestSessionLocal() as db:
        tenant = db.query(Tenant).filter(Tenant.tenant_id == PROBE_TENANT).first()
        tenant.monthly_budget_krw = Decimal("100.00")
        db.commit()

    # 예산(₩100) 초과시키기
    res = client.post("/api/v1/external/usage/report", json={
        "key_id": PROBE_KEY, "prompt_tokens": 100000, "completion_tokens": 100000,
    })
    assert res.status_code == 200, res.text

    def snapshot():
        ov = client.get("/api/v1/finops/overview").json()
        row = [t for t in ov["tenants"] if t["tenant_id"] == PROBE_TENANT][0]
        with TestSessionLocal() as db:
            t = db.query(Tenant).filter(Tenant.tenant_id == PROBE_TENANT).first()
            effective = float(tenant_effective_spend(t))
        return row, effective

    before, eff_before = snapshot()
    assert before["is_blocked"] is True
    assert eff_before >= 100.0
    assert before["drift_krw"] == 0.0

    assert client.post(f"/api/v1/tenants/{PROBE_TENANT}/reset-spent").status_code == 200

    after, eff_after = snapshot()
    # UI(원장)와 집행(캐시)이 함께 해제되어야 한다
    assert after["spent_budget_krw"] == 0.0, after
    assert after["is_blocked"] is False, after
    assert eff_after == 0.0
    # 드리프트가 남지 않아야 한다
    assert after["drift_krw"] == 0.0, after

    # 원장은 지워지지 않고 원 과금 + 조정분개가 모두 남아야 한다 (감사 추적)
    with TestSessionLocal() as db:
        rows = db.query(DailyTokenLedger).filter(DailyTokenLedger.tenant_id == PROBE_TENANT).all()
        model_ids = {r.model_id for r in rows}
        assert "__adjustment__" in model_ids, model_ids
        assert any(r.model_id not in ("__adjustment__",) and r.cost_krw > 0 for r in rows), (
            "원 과금 내역이 삭제되었습니다"
        )
        assert float(sum(r.cost_krw for r in rows)) == 0.0


def test_key_cache_has_same_period_semantics_as_reconcile():
    """
    VirtualKey.spent_krw 의 기간 의미가 계량과 정합화에서 동일해야 한다.

    회귀 배경: record_usage 는 전기간 누적인데 reconcile 은 당월 합계로 덮어써,
    정합화를 실행하면 같은 필드의 의미가 조용히 바뀌었다.
    """
    from app.core.billing_period import current_month

    client.post("/api/v1/external/usage/report", json={
        "key_id": PROBE_KEY, "prompt_tokens": 10000, "completion_tokens": 10000,
    })

    with TestSessionLocal() as db:
        key = db.query(VirtualKey).filter(VirtualKey.key_id == PROBE_KEY).first()
        assert key.spent_period_month == current_month()
        spend_after_metering = float(key.spent_krw)
        tokens_after_metering = int(key.total_tokens)

    # 정합화를 돌려도 값이 바뀌지 않아야 한다 (의미가 같으므로)
    client.post("/api/v1/finops/reconcile")
    with TestSessionLocal() as db:
        key = db.query(VirtualKey).filter(VirtualKey.key_id == PROBE_KEY).first()
        assert float(key.spent_krw) == spend_after_metering
        assert int(key.total_tokens) == tokens_after_metering


def test_key_cache_rolls_over_on_new_month():
    """가상키 캐시도 결산월 경계에서 자기 치유되어야 한다."""
    from app.core.billing_period import current_month

    with TestSessionLocal() as db:
        key = db.query(VirtualKey).filter(VirtualKey.key_id == PROBE_KEY).first()
        key.spent_krw = Decimal("888888.00")
        key.total_tokens = 777777
        key.spent_period_month = "2000-01"
        db.commit()

    client.post("/api/v1/external/usage/report", json={
        "key_id": PROBE_KEY, "prompt_tokens": 1000, "completion_tokens": 1000,
    })

    with TestSessionLocal() as db:
        key = db.query(VirtualKey).filter(VirtualKey.key_id == PROBE_KEY).first()
        assert key.spent_period_month == current_month()
        assert float(key.spent_krw) < 100.0
        assert int(key.total_tokens) == 2000
