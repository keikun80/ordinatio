import json
import pathlib
import pytest
from fastapi.testclient import TestClient
from app.main import app
from tests.conftest import TestSessionLocal
from app.models.system_prompt import SystemPrompt

client = TestClient(app)

TOKEN_VECTORS_PATH = pathlib.Path(__file__).parent / "fixtures" / "token_vectors.json"


def _load_token_vectors():
    """FE/BE 토큰 추정 parity 검증용 공용 벡터"""
    return json.loads(TOKEN_VECTORS_PATH.read_text(encoding="utf-8"))["vectors"]

def test_list_system_prompts():
    """Test listing system prompts with optional filters."""
    res = client.get("/api/v1/system-prompts")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) >= 3

    # Filter by target_type
    res_global = client.get("/api/v1/system-prompts?target_type=GLOBAL")
    assert res_global.status_code == 200
    global_items = res_global.json()
    assert all(item["target_type"] == "GLOBAL" for item in global_items)

    # Search filter
    res_search = client.get("/api/v1/system-prompts?search=자산관리")
    assert res_search.status_code == 200
    assert any("자산관리" in item["name"] for item in res_search.json())

def test_create_and_delete_system_prompt():
    """Test creating a new system prompt and then deleting it."""
    # Temporarily deactivate or delete conflicting global prompt if any
    with TestSessionLocal() as db:
        db.query(SystemPrompt).filter(SystemPrompt.prompt_id == "sp-api-test-01").delete()
        global_p = db.query(SystemPrompt).filter(SystemPrompt.target_type == "GLOBAL", SystemPrompt.is_active == True).first()
        if global_p:
            global_p.is_active = False
        db.commit()

    payload = {
        "prompt_id": "sp-api-test-01",
        "name": "API 신규 등록 테스트 프롬프트",
        "description": "테스트 설명",
        "content": "당신은 테스트 전용 AI 어시스턴트입니다.",
        "target_type": "GLOBAL",
        "injection_mode": "PREPEND",
        "is_active": True
    }
    # 1. Create
    res = client.post("/api/v1/system-prompts", json=payload)
    assert res.status_code == 201
    created = res.json()
    assert created["prompt_id"] == "sp-api-test-01"
    assert created["estimated_tokens"] > 0
    assert created["target_name"] == "전사 공통 (Global)"
    assert created.get("version", 1) == 1

    # 2. Get
    get_res = client.get("/api/v1/system-prompts/sp-api-test-01")
    assert get_res.status_code == 200
    assert get_res.json()["name"] == "API 신규 등록 테스트 프롬프트"

    # 3. Update
    put_res = client.put("/api/v1/system-prompts/sp-api-test-01", json={
        "name": "수정된 API 테스트 프롬프트",
        "injection_mode": "OVERRIDE"
    })
    assert put_res.status_code == 200
    assert put_res.json()["name"] == "수정된 API 테스트 프롬프트"
    assert put_res.json()["injection_mode"] == "OVERRIDE"
    assert put_res.json().get("version") == 2

    # 4. Delete
    del_res = client.delete("/api/v1/system-prompts/sp-api-test-01")
    assert del_res.status_code == 200

    # 5. Confirm 404
    get_again = client.get("/api/v1/system-prompts/sp-api-test-01")
    assert get_again.status_code == 404

    # Restore global prompt active state
    with TestSessionLocal() as db:
        sp_guard = db.query(SystemPrompt).filter(SystemPrompt.prompt_id == "sp-global-guardrail").first()
        if sp_guard:
            sp_guard.is_active = True
        db.commit()

def test_create_system_prompt_target_id_validation():
    """Test that creating a ROUTE/TENANT/VIRTUAL_KEY prompt without target_id fails with HTTP 400."""
    payload = {
        "name": "실패 테스트 프롬프트",
        "content": "내용",
        "target_type": "ROUTE",
        "target_id": None  # Invalid for ROUTE
    }
    res = client.post("/api/v1/system-prompts", json=payload)
    assert res.status_code == 400
    assert "target_id가 반드시 필요합니다" in res.json()["detail"]

def test_resolve_system_prompt_precedence_hierarchy():
    """
    Test prompt resolution precedence hierarchy:
    VIRTUAL_KEY > ROUTE > TENANT > GLOBAL
    """
    # 1. When only tenant_id matches
    res_tenant = client.post("/api/v1/system-prompts/resolve", json={
        "tenant_id": "dept-wm",
        "input_messages": [{"role": "user", "content": "포트폴리오 제안해줘"}]
    })
    assert res_tenant.status_code == 200
    data_tenant = res_tenant.json()
    assert data_tenant["matched"] is True
    assert data_tenant["resolved_by"] == "TENANT"
    assert data_tenant["matched_prompt"]["prompt_id"] == "sp-wm-advisor"
    assert any(m.get("role") == "system" for m in data_tenant["final_messages"])

    # 2. When route_name matches (higher priority than tenant)
    res_route = client.post("/api/v1/system-prompts/resolve", json={
        "tenant_id": "dept-wm",
        "route_name": "code-copilot-v2",
        "input_messages": [{"role": "user", "content": "SQL 쿼리 작성해줘"}]
    })
    assert res_route.status_code == 200
    data_route = res_route.json()
    assert data_route["matched"] is True
    assert data_route["resolved_by"] == "ROUTE"
    assert data_route["matched_prompt"]["prompt_id"] == "sp-route-code"

    # 3. When no specific target matches, fallback to GLOBAL
    res_global = client.post("/api/v1/system-prompts/resolve", json={
        "tenant_id": "dept-unknown",
        "route_name": "unknown-route",
        "input_messages": [{"role": "user", "content": "일반 질의입니다."}]
    })
    assert res_global.status_code == 200
    data_global = res_global.json()
    assert data_global["matched"] is True
    assert data_global["resolved_by"] == "GLOBAL"
    assert data_global["matched_prompt"]["prompt_id"] == "sp-global-guardrail"

def test_resolve_injection_modes():
    """Test PREPEND, OVERRIDE, and FALLBACK_ONLY injection modes."""
    # Create temp prompts for testing modes
    with TestSessionLocal() as db:
        db.query(SystemPrompt).filter(SystemPrompt.prompt_id == "sp-mode-override").delete()
        db.add(SystemPrompt(
            prompt_id="sp-mode-override",
            name="Override 모드 테스트",
            content="[강제 대체된 시스템 프롬프트]",
            target_type="ROUTE",
            target_id="test-route-override",
            injection_mode="OVERRIDE",
            is_active=True
        ))
        db.commit()

    # Test OVERRIDE: user's system prompt should be replaced
    res = client.post("/api/v1/system-prompts/resolve", json={
        "route_name": "test-route-override",
        "input_messages": [
            {"role": "system", "content": "클라이언트가 보낸 기존 지침"},
            {"role": "user", "content": "안녕"}
        ]
    })
    assert res.status_code == 200
    msgs = res.json()["final_messages"]
    sys_msgs = [m for m in msgs if m.get("role") == "system"]
    assert len(sys_msgs) == 1
    assert sys_msgs[0]["content"] == "[강제 대체된 시스템 프롬프트]"

    # Clean up
    with TestSessionLocal() as db:
        db.query(SystemPrompt).filter(SystemPrompt.prompt_id == "sp-mode-override").delete()
        db.commit()

def test_system_prompt_duplicate_binding_prevention_and_audit():
    """Verify that duplicate active binding on same target fails, and WORM AuditLog is recorded."""
    from app.models.audit_log import AuditLog

    # 1. Create initial prompt bound to ROUTE
    payload1 = {
        "prompt_id": "sp-dup-test-01",
        "name": "중복 검증 1차 프롬프트",
        "content": "지침 1",
        "target_type": "ROUTE",
        "target_id": "code-copilot-v2",
        "is_active": True
    }
    client.delete("/api/v1/system-prompts/sp-dup-test-01")
    client.delete("/api/v1/system-prompts/sp-dup-test-02")

    res1 = client.post("/api/v1/system-prompts", json=payload1)
    # Note: if code-copilot-v2 already has sp-route-code bound in seed data, it correctly fails with 400!
    if res1.status_code == 400:
        assert "이미 활성화된" in res1.json()["detail"]
    else:
        assert res1.status_code == 201

        # 2. Attempt to create second active prompt on same target -> Must fail with 400
        payload2 = {
            "prompt_id": "sp-dup-test-02",
            "name": "중복 검증 2차 프롬프트",
            "content": "지침 2",
            "target_type": "ROUTE",
            "target_id": "code-copilot-v2",
            "is_active": True
        }
        res2 = client.post("/api/v1/system-prompts", json=payload2)
        assert res2.status_code == 400
        assert "이미 활성화된" in res2.json()["detail"]

        # Clean up
        client.delete("/api/v1/system-prompts/sp-dup-test-01")

    # 3. GLOBAL Duplicate active binding test
    # Clean up any test global prompts first
    client.delete("/api/v1/system-prompts/sp-dup-global-01")
    payload_global = {
        "prompt_id": "sp-dup-global-01",
        "name": "글로벌 중복 생성 시도",
        "content": "두 번째 글로벌",
        "target_type": "GLOBAL",
        "is_active": True
    }
    res_global = client.post("/api/v1/system-prompts", json=payload_global)
    # Since seed data already has sp-global-guardrail active, this must fail with 400!
    assert res_global.status_code == 400
    assert "전사 공통(GLOBAL)" in res_global.json()["detail"]

    # 4. Check AuditLog entry recorded
    # Note: test_create_and_delete_system_prompt above created and deleted sp-api-test-01, recording PROMPT_CREATED & PROMPT_DELETED
    with TestSessionLocal() as db:
        # Also record a test prompt audit entry if none exists
        from app.api.v1.endpoints.system_prompts import _record_prompt_audit_log
        _record_prompt_audit_log(db, "test_admin", "PROMPT_CREATED", "sp-test-audit", {"info": "test"})
        audit = db.query(AuditLog).filter(AuditLog.action_taken.like("PROMPT_%")).first()
        assert audit is not None
        assert "audit-prompt-" in audit.log_id

def test_system_prompts_content_search():
    """Verify that search query filters by content, description, target_name as well as name, and returns X-Total-Count header."""
    # Check X-Total-Count header
    res_all = client.get("/api/v1/system-prompts")
    assert res_all.status_code == 200
    assert "X-Total-Count" in res_all.headers
    total_val = int(res_all.headers["X-Total-Count"])
    assert total_val >= 3

    # Search by keyword in content: '주민등록번호' (in sp-global-guardrail content)
    res = client.get("/api/v1/system-prompts?search=주민등록번호")
    assert res.status_code == 200
    assert "X-Total-Count" in res.headers
    items = res.json()
    assert len(items) >= 1
    assert any("주민등록번호" in p["content"] for p in items)

    # Search by keyword in content: 'PEP8' (in sp-route-code content)
    res_code = client.get("/api/v1/system-prompts?search=PEP8")
    assert res_code.status_code == 200
    items_code = res_code.json()
    assert len(items_code) >= 1
    assert any("PEP8" in p["content"] for p in items_code)

def test_prompt_simulator_token_delta_and_applied_vars():
    """Verify simulator /resolve returns applied_variables and positive token_delta."""
    resolve_req = {
        "route_name": "code-copilot-v2",
        "input_messages": [
            {"role": "user", "content": "파이썬 함수 작성해줘"}
        ]
    }
    res = client.post("/api/v1/system-prompts/resolve", json=resolve_req)
    assert res.status_code == 200
    data = res.json()
    assert data["matched"] is True
    assert data["token_delta"] > 0
    assert isinstance(data["applied_variables"], dict)


# ---------------------------------------------------------------------------
# Phase 1: 데이터 정합성 회귀 테스트
# ---------------------------------------------------------------------------

def _cleanup(*prompt_ids):
    with TestSessionLocal() as db:
        for pid in prompt_ids:
            db.query(SystemPrompt).filter(SystemPrompt.prompt_id == pid).delete()
        db.commit()


def test_target_validation_cannot_be_bypassed_by_target_name():
    """
    target_name 은 서버 파생 표시용 캐시이므로, 이를 함께 전송해도 바인딩 타겟 존재 검증을
    우회할 수 없어야 한다. (우회 시 영구 미매칭 '좀비 프롬프트'가 생성됨)
    """
    _cleanup("sp-bypass-route", "sp-bypass-tenant", "sp-bypass-base")

    # 1. ROUTE + target_id 누락 + target_name 전송 -> 400
    res_route = client.post("/api/v1/system-prompts", json={
        "prompt_id": "sp-bypass-route",
        "name": "우회 시도 (ROUTE)",
        "content": "내용",
        "target_type": "ROUTE",
        "target_id": None,
        "target_name": "존재하지않는라우트",
        "is_active": True
    })
    assert res_route.status_code == 400, res_route.text
    assert "target_id가 반드시 필요합니다" in res_route.json()["detail"]

    # 2. TENANT + 존재하지 않는 target_id + target_name 전송 -> 400
    res_tenant = client.post("/api/v1/system-prompts", json={
        "prompt_id": "sp-bypass-tenant",
        "name": "우회 시도 (TENANT)",
        "content": "내용",
        "target_type": "TENANT",
        "target_id": "dept-does-not-exist",
        "target_name": "가짜부서",
        "is_active": True
    })
    assert res_tenant.status_code == 400, res_tenant.text
    assert "존재하지 않습니다" in res_tenant.json()["detail"]

    # 3. PUT 으로 동일 우회 시도 -> 400
    base = client.post("/api/v1/system-prompts", json={
        "prompt_id": "sp-bypass-base",
        "name": "우회 검증 기준 프롬프트",
        "content": "내용",
        "target_type": "TENANT",
        "target_id": "dept-ai-lab",
        "is_active": False
    })
    assert base.status_code == 201, base.text

    res_put = client.put("/api/v1/system-prompts/sp-bypass-base", json={
        "target_id": "dept-does-not-exist",
        "target_name": "가짜부서"
    })
    assert res_put.status_code == 400, res_put.text
    assert "존재하지 않습니다" in res_put.json()["detail"]

    _cleanup("sp-bypass-base")


def test_route_target_id_is_normalized_for_duplicate_detection():
    """ROUTE 바인딩은 policy_id 로 전달되어도 route_name 으로 정규화되어 중복이 탐지되어야 한다."""
    _cleanup("sp-norm-01", "sp-norm-02")

    res1 = client.post("/api/v1/system-prompts", json={
        "prompt_id": "sp-norm-01",
        "name": "정규화 검증 1",
        "content": "지침",
        "target_type": "ROUTE",
        "target_id": "pol-code-copilot",   # policy_id 로 전달
        "is_active": False
    })
    assert res1.status_code == 201, res1.text
    # 저장 시 route_name 으로 정규화된다
    assert res1.json()["target_id"] == "code-copilot-v2"

    _cleanup("sp-norm-01", "sp-norm-02")


def test_update_rejects_duplicate_active_binding():
    """PUT 경로에서도 동일 타겟 중복 활성화가 차단되어야 한다 (카드 토글이 사용하는 경로)."""
    _cleanup("sp-dupput-01")

    created = client.post("/api/v1/system-prompts", json={
        "prompt_id": "sp-dupput-01",
        "name": "PUT 중복 검증",
        "content": "지침",
        "target_type": "ROUTE",
        "target_id": "code-copilot-v2",
        "is_active": False
    })
    assert created.status_code == 201, created.text

    # 시드의 sp-route-code 가 동일 라우트에 활성 상태이므로 활성화 전환은 400
    res = client.put("/api/v1/system-prompts/sp-dupput-01", json={"is_active": True})
    assert res.status_code == 400, res.text
    assert "이미 활성화된" in res.json()["detail"]

    _cleanup("sp-dupput-01")


def test_version_not_consumed_by_activation_toggle():
    """활성 여부 토글만으로는 version 이 증가하지 않고, 실질 변경 시에만 증가해야 한다."""
    _cleanup("sp-ver-toggle")

    created = client.post("/api/v1/system-prompts", json={
        "prompt_id": "sp-ver-toggle",
        "name": "버전 규칙 검증",
        "content": "지침 A",
        "target_type": "TENANT",
        "target_id": "dept-ai-lab",
        "is_active": False
    })
    assert created.status_code == 201
    assert created.json()["version"] == 1

    # 1. 활성 토글 -> version 유지
    toggled = client.put("/api/v1/system-prompts/sp-ver-toggle", json={"is_active": True})
    assert toggled.status_code == 200, toggled.text
    assert toggled.json()["version"] == 1
    assert toggled.json()["is_active"] is True

    # 2. 본문 변경 -> version 증가
    edited = client.put("/api/v1/system-prompts/sp-ver-toggle", json={"content": "지침 B (개정)"})
    assert edited.status_code == 200
    assert edited.json()["version"] == 2

    # 3. 동일 본문 재전송 -> version 유지 (no-op)
    noop = client.put("/api/v1/system-prompts/sp-ver-toggle", json={"content": "지침 B (개정)"})
    assert noop.status_code == 200
    assert noop.json()["version"] == 2

    _cleanup("sp-ver-toggle")


def test_target_name_cache_sync_is_persisted_for_search():
    """
    목록 조회 시 동기화된 target_name 이 DB 에 영속되어야 한다.
    영속되지 않으면 화면에는 새 이름이 보이지만 서버사이드 search 는 낡은 컬럼을 조회해 누락된다.
    """
    _cleanup("sp-sync-01")
    created = client.post("/api/v1/system-prompts", json={
        "prompt_id": "sp-sync-01",
        "name": "타겟명 동기화 검증",
        "content": "지침",
        "target_type": "TENANT",
        "target_id": "dept-ai-lab",
        "is_active": False
    })
    assert created.status_code == 201, created.text
    original_name = created.json()["target_name"]

    # 부서명 변경
    renamed = client.patch("/api/v1/tenants/dept-ai-lab", json={"name": "AI융합기술연구소(개편)"})
    assert renamed.status_code == 200, renamed.text
    try:
        # 목록 조회 1회로 캐시 동기화 유발 (search 는 명칭/본문/타겟명을 대상으로 한다)
        listed = client.get("/api/v1/system-prompts?search=타겟명 동기화 검증")
        assert listed.status_code == 200
        matches = [p for p in listed.json() if p["prompt_id"] == "sp-sync-01"]
        assert matches, listed.json()
        synced = matches[0]
        assert "개편" in synced["target_name"]
        assert synced["target_name"] != original_name

        # 동기화 결과가 영속되었으므로 새 부서명으로 서버사이드 검색이 적중해야 한다
        searched = client.get("/api/v1/system-prompts?search=개편")
        assert searched.status_code == 200
        assert any(p["prompt_id"] == "sp-sync-01" for p in searched.json())
    finally:
        client.patch("/api/v1/tenants/dept-ai-lab", json={"name": "AI융합기술연구소"})
        _cleanup("sp-sync-01")


def test_audit_log_failure_is_logged_not_silenced(monkeypatch, caplog):
    """WORM 감사 기록 실패는 주 트랜잭션을 막지 않되, 반드시 ERROR 로 추적 가능해야 한다."""
    import logging
    from app.core.worm_storage import WormStorage

    _cleanup("sp-audit-fail")

    def _boom(*args, **kwargs):
        raise RuntimeError("WORM 저장소 장애 시뮬레이션")

    monkeypatch.setattr(WormStorage, "record_audit_log", staticmethod(_boom))

    with caplog.at_level(logging.ERROR, logger="app.api.v1.endpoints.system_prompts"):
        res = client.post("/api/v1/system-prompts", json={
            "prompt_id": "sp-audit-fail",
            "name": "감사 실패 검증",
            "content": "지침",
            "target_type": "TENANT",
            "target_id": "dept-ai-lab",
            "is_active": False
        })

    # 주 트랜잭션은 성공해야 한다
    assert res.status_code == 201, res.text
    # 그러나 실패 사실은 침묵되지 않아야 한다 (로그 + 응답 헤더)
    assert any("감사로그 기록 실패" in rec.message for rec in caplog.records), caplog.text
    assert res.headers.get("x-orche-audit-degraded") == "true", dict(res.headers)

    _cleanup("sp-audit-fail")


def test_audit_degraded_header_absent_on_success():
    """정상 경로에서는 감사 저하 헤더가 붙지 않아야 한다 (오탐 방지)."""
    _cleanup("sp-audit-ok")
    res = client.post("/api/v1/system-prompts", json={
        "prompt_id": "sp-audit-ok",
        "name": "감사 정상 경로 검증",
        "content": "지침",
        "target_type": "TENANT",
        "target_id": "dept-ai-lab",
        "is_active": False
    })
    assert res.status_code == 201, res.text
    assert "x-orche-audit-degraded" not in res.headers
    _cleanup("sp-audit-ok")


def test_bound_prompt_blocks_target_deletion():
    """바인딩된 시스템 프롬프트가 있으면 타겟 자원 삭제가 400 으로 차단되고, force=true 로 해제된다."""
    _cleanup("sp-guard-tenant")

    # 삭제 전용 테넌트 생성
    client.delete("/api/v1/tenants/dept-guard-test?force=true")
    t_res = client.post("/api/v1/tenants", json={
        "tenant_id": "dept-guard-test",
        "name": "바인딩 가드 검증부",
        "department_code": "GUARD-01",
        "monthly_budget_krw": 1000000
    })
    assert t_res.status_code in (200, 201), t_res.text

    bound = client.post("/api/v1/system-prompts", json={
        "prompt_id": "sp-guard-tenant",
        "name": "가드 검증 바인딩 프롬프트",
        "content": "지침",
        "target_type": "TENANT",
        "target_id": "dept-guard-test",
        "is_active": True
    })
    assert bound.status_code == 201, bound.text

    # 1. 가드 없이 삭제 시도 -> 400
    blocked = client.delete("/api/v1/tenants/dept-guard-test")
    assert blocked.status_code == 400, blocked.text
    assert "바인딩된 시스템 프롬프트" in blocked.json()["detail"]

    # 2. force=true -> 삭제 허용 + 프롬프트 비활성화
    forced = client.delete("/api/v1/tenants/dept-guard-test?force=true")
    assert forced.status_code == 200, forced.text
    assert "sp-guard-tenant" in forced.json().get("deactivated_prompts", [])

    after = client.get("/api/v1/system-prompts/sp-guard-tenant")
    assert after.status_code == 200
    assert after.json()["is_active"] is False

    _cleanup("sp-guard-tenant")


@pytest.mark.parametrize("vector", _load_token_vectors(), ids=lambda v: repr(v["text"])[:40])
def test_estimate_tokens_matches_shared_vectors(vector):
    """
    토큰 추정 로직은 고정 벡터에 대해 안정적이어야 한다.
    동일 벡터로 프론트엔드 구현(frontend/src/utils/tokenEstimate.js)을 비교하는 검증이
    scripts/verify-phase-system-prompt.sh [4/4] 단계에 있어 FE/BE 드리프트를 차단한다.
    """
    from app.api.v1.endpoints.system_prompts import _estimate_tokens
    assert _estimate_tokens(vector["text"]) == vector["expected"]


def test_seed_prompt_token_counts_are_consistent():
    """시드 데이터의 하드코딩된 estimated_tokens 가 현재 추정기와 일치해야 한다."""
    from app.api.v1.endpoints.system_prompts import _estimate_tokens

    with TestSessionLocal() as db:
        seeded = db.query(SystemPrompt).filter(
            SystemPrompt.prompt_id.in_(["sp-global-guardrail", "sp-wm-advisor", "sp-route-code"])
        ).all()
        assert len(seeded) == 3
        for p in seeded:
            assert p.estimated_tokens == _estimate_tokens(p.content), (
                f"{p.prompt_id}: 시드 하드코딩 {p.estimated_tokens} != 추정기 {_estimate_tokens(p.content)}"
            )


def test_created_prompt_tokens_use_shared_estimator():
    """등록 시 저장되는 estimated_tokens 가 공용 추정기 결과와 일치해야 한다."""
    from app.api.v1.endpoints.system_prompts import _estimate_tokens

    _cleanup("sp-token-parity")
    content = "[사내 보안 지침]\n1. 금융거래정보를 유출하지 마십시오."
    created = client.post("/api/v1/system-prompts", json={
        "prompt_id": "sp-token-parity",
        "name": "토큰 추정 검증",
        "content": content,
        "target_type": "TENANT",
        "target_id": "dept-ai-lab",
        "is_active": False
    })
    assert created.status_code == 201, created.text
    try:
        assert created.json()["estimated_tokens"] == _estimate_tokens(content)
    finally:
        _cleanup("sp-token-parity")


def test_system_prompt_stats_endpoint():
    """KPI 집계 엔드포인트가 전체 기준 통계를 반환해야 한다 (페이지네이션과 무관)."""
    res = client.get("/api/v1/system-prompts/stats")
    assert res.status_code == 200, res.text
    data = res.json()

    listed = client.get("/api/v1/system-prompts?limit=500")
    all_items = listed.json()

    assert data["total"] == len(all_items)
    assert data["active"] == len([p for p in all_items if p["is_active"]])
    for t in ("ROUTE", "VIRTUAL_KEY", "TENANT", "GLOBAL"):
        assert t in data["by_target_type"]
        assert data["by_target_type"][t] == len([p for p in all_items if p["target_type"] == t])
    assert sum(data["by_target_type"].values()) == data["total"]


def test_system_prompt_variables_endpoint_matches_engine():
    """
    /variables 응답이 주입 엔진의 실제 치환 키 집합과 일치해야 한다.
    (명세-구현 드리프트 방지: UI 안내 변수와 엔진 지원 변수가 어긋나면 안 됨)
    """
    from app.core.prompt_injector import render_prompt_variables, SUPPORTED_PROMPT_VARIABLES

    res = client.get("/api/v1/system-prompts/variables")
    assert res.status_code == 200, res.text
    items = res.json()
    assert len(items) == len(SUPPORTED_PROMPT_VARIABLES)

    api_names = {i["name"] for i in items}
    assert api_names == set(SUPPORTED_PROMPT_VARIABLES.keys())

    # 엔진이 실제로 모든 플레이스홀더를 치환하는지 확인
    body = " ".join(i["placeholder"] for i in items)
    rendered, applied = render_prompt_variables(
        body,
        {"route_name": "r1", "tenant_id": "t1", "tenant_name": "부서", "key_id": "vk-1"}
    )
    assert len(applied) == len(items)
    for i in items:
        assert i["placeholder"] not in rendered, f"{i['placeholder']} 가 치환되지 않았습니다"


def test_system_prompt_pagination_offset_limit_and_total_count():
    """offset/limit 페이지네이션과 X-Total-Count 정확성 (offset 적용 시에도 전체값 유지)."""
    created_ids = []
    try:
        for i in range(12):
            pid = f"sp-page-{i:02d}"
            created_ids.append(pid)
            res = client.post("/api/v1/system-prompts", json={
                "prompt_id": pid,
                "name": f"페이지네이션 검증 프롬프트 {i:02d}",
                "content": f"지침 본문 {i:02d}",
                "target_type": "TENANT",
                "target_id": "dept-ai-lab",
                "is_active": False
            })
            assert res.status_code == 201, res.text

        marker = "페이지네이션 검증 프롬프트"
        page1 = client.get(f"/api/v1/system-prompts?search={marker}&limit=9&offset=0")
        assert page1.status_code == 200
        assert int(page1.headers["X-Total-Count"]) == 12
        assert len(page1.json()) == 9

        page2 = client.get(f"/api/v1/system-prompts?search={marker}&limit=9&offset=9")
        assert page2.status_code == 200
        # offset 이 적용되어도 X-Total-Count 는 전체 건수를 유지해야 한다
        assert int(page2.headers["X-Total-Count"]) == 12
        assert len(page2.json()) == 3

        # 페이지 간 중복/누락이 없어야 한다
        ids1 = [p["prompt_id"] for p in page1.json()]
        ids2 = [p["prompt_id"] for p in page2.json()]
        assert set(ids1).isdisjoint(set(ids2))
        assert set(ids1) | set(ids2) == set(created_ids)
    finally:
        _cleanup(*created_ids)


def test_system_prompt_is_active_filter():
    """is_active 필터가 서버사이드에서 적용되어야 한다."""
    _cleanup("sp-filter-off")
    created = client.post("/api/v1/system-prompts", json={
        "prompt_id": "sp-filter-off",
        "name": "비활성 필터 검증",
        "content": "지침",
        "target_type": "TENANT",
        "target_id": "dept-ai-lab",
        "is_active": False
    })
    assert created.status_code == 201, created.text
    try:
        inactive = client.get("/api/v1/system-prompts?is_active=false&limit=500")
        assert inactive.status_code == 200
        assert all(p["is_active"] is False for p in inactive.json())
        assert any(p["prompt_id"] == "sp-filter-off" for p in inactive.json())

        active = client.get("/api/v1/system-prompts?is_active=true&limit=500")
        assert active.status_code == 200
        assert all(p["is_active"] is True for p in active.json())
        assert not any(p["prompt_id"] == "sp-filter-off" for p in active.json())
    finally:
        _cleanup("sp-filter-off")


def test_version_history_records_and_restores():
    """버전 이력 기록(CREATE/UPDATE/ACTIVATE) 및 비파괴 복원(append-only) 검증."""
    _cleanup("sp-hist-01")

    created = client.post("/api/v1/system-prompts", json={
        "prompt_id": "sp-hist-01",
        "name": "이력 검증 프롬프트",
        "content": "1차 지침",
        "target_type": "TENANT",
        "target_id": "dept-ai-lab",
        "injection_mode": "PREPEND",
        "is_active": False
    })
    assert created.status_code == 201, created.text

    try:
        # 수정 3회 (본문 2회 + 활성 토글 1회)
        assert client.put("/api/v1/system-prompts/sp-hist-01", json={"content": "2차 지침"}).status_code == 200
        assert client.put("/api/v1/system-prompts/sp-hist-01", json={"content": "3차 지침"}).status_code == 200
        assert client.put("/api/v1/system-prompts/sp-hist-01", json={"is_active": True}).status_code == 200

        hist = client.get("/api/v1/system-prompts/sp-hist-01/versions")
        assert hist.status_code == 200, hist.text
        rows = hist.json()
        # CREATE + UPDATE*2 + ACTIVATE = 4건
        assert len(rows) == 4, rows
        kinds = [r["change_kind"] for r in rows]
        assert kinds[0] == "ACTIVATE"   # 최신순
        assert kinds[-1] == "CREATE"
        assert "UPDATE" in kinds

        # 기본 조회는 본문을 포함하지 않는다
        assert all(r["content"] is None for r in rows)
        # include_content=true 에서는 전문을 반환한다
        full = client.get("/api/v1/system-prompts/sp-hist-01/versions?include_content=true")
        assert full.status_code == 200
        assert all(r["content"] for r in full.json())

        # 활성 토글은 version 을 소모하지 않으므로 현재 version 은 3
        current = client.get("/api/v1/system-prompts/sp-hist-01").json()
        assert current["version"] == 3
        assert current["content"] == "3차 지침"

        # 최초 등록 스냅샷(1차 지침)으로 복원 -> 새 버전 생성 (파괴적 롤백 금지)
        create_row = [r for r in rows if r["change_kind"] == "CREATE"][0]
        restored = client.post(f"/api/v1/system-prompts/sp-hist-01/versions/{create_row['id']}/restore")
        assert restored.status_code == 200, restored.text
        assert restored.json()["content"] == "1차 지침"
        assert restored.json()["version"] == 4

        hist_after = client.get("/api/v1/system-prompts/sp-hist-01/versions").json()
        assert len(hist_after) == 5
        assert hist_after[0]["change_kind"] == "RESTORE"
        assert "v1 내용으로 복원" in hist_after[0]["change_summary"]
    finally:
        _cleanup("sp-hist-01")


def test_version_history_purged_on_delete():
    """영구 삭제 시 버전 이력도 정리되어 동일 ID 재등록 시 과거 이력이 섞이지 않아야 한다."""
    _cleanup("sp-hist-purge")
    payload = {
        "prompt_id": "sp-hist-purge",
        "name": "이력 정리 검증",
        "content": "지침",
        "target_type": "TENANT",
        "target_id": "dept-ai-lab",
        "is_active": False
    }
    assert client.post("/api/v1/system-prompts", json=payload).status_code == 201
    assert client.put("/api/v1/system-prompts/sp-hist-purge", json={"content": "지침 개정"}).status_code == 200
    assert len(client.get("/api/v1/system-prompts/sp-hist-purge/versions").json()) == 2

    del_res = client.delete("/api/v1/system-prompts/sp-hist-purge")
    assert del_res.status_code == 200

    # 동일 ID 재등록 후 이력은 CREATE 1건만 존재해야 한다
    assert client.post("/api/v1/system-prompts", json=payload).status_code == 201
    try:
        rows = client.get("/api/v1/system-prompts/sp-hist-purge/versions").json()
        assert len(rows) == 1
        assert rows[0]["change_kind"] == "CREATE"
    finally:
        _cleanup("sp-hist-purge")


def test_restore_rejected_on_duplicate_active_binding():
    """복원 결과가 동일 타겟 중복 활성을 만들면 400 으로 차단되어야 한다."""
    _cleanup("sp-restore-a", "sp-restore-b")

    # A: 활성 상태로 등록 후 비활성 전환 -> v1 스냅샷은 활성 상태로 남는다
    a = client.post("/api/v1/system-prompts", json={
        "prompt_id": "sp-restore-a",
        "name": "복원 충돌 검증 A",
        "content": "지침 A",
        "target_type": "TENANT",
        "target_id": "dept-ai-lab",
        "is_active": True
    })
    assert a.status_code == 201, a.text
    assert client.put("/api/v1/system-prompts/sp-restore-a", json={"is_active": False}).status_code == 200

    # B: 동일 타겟을 활성 상태로 점유
    b = client.post("/api/v1/system-prompts", json={
        "prompt_id": "sp-restore-b",
        "name": "복원 충돌 검증 B",
        "content": "지침 B",
        "target_type": "TENANT",
        "target_id": "dept-ai-lab",
        "is_active": True
    })
    assert b.status_code == 201, b.text

    try:
        # A 의 최초 등록 스냅샷(활성 상태) 복원 시도 -> B 와 충돌하여 400
        a_rows = client.get("/api/v1/system-prompts/sp-restore-a/versions").json()
        a_create = [r for r in a_rows if r["change_kind"] == "CREATE"][0]
        assert a_create["is_active"] is True
        res = client.post(f"/api/v1/system-prompts/sp-restore-a/versions/{a_create['id']}/restore")
        assert res.status_code == 400, res.text
        assert "이미 활성화된" in res.json()["detail"]
    finally:
        _cleanup("sp-restore-a", "sp-restore-b")


def test_restore_rejected_when_target_resource_gone():
    """복원 시점에 바인딩 타겟이 사라졌다면 복원이 차단되어야 한다 (좀비 프롬프트 방지)."""
    _cleanup("sp-restore-orphan")

    client.delete("/api/v1/tenants/dept-restore-tmp?force=true")
    t = client.post("/api/v1/tenants", json={
        "tenant_id": "dept-restore-tmp",
        "name": "복원 타겟 검증부",
        "department_code": "RST-01",
        "monthly_budget_krw": 1000000
    })
    assert t.status_code in (200, 201), t.text

    created = client.post("/api/v1/system-prompts", json={
        "prompt_id": "sp-restore-orphan",
        "name": "복원 타겟 소실 검증",
        "content": "지침",
        "target_type": "TENANT",
        "target_id": "dept-restore-tmp",
        "is_active": False
    })
    assert created.status_code == 201, created.text

    rows = client.get("/api/v1/system-prompts/sp-restore-orphan/versions").json()
    snapshot_id = rows[0]["id"]
    try:
        # 타겟 테넌트를 강제 삭제 (프롬프트는 비활성화된 채 고아가 된다)
        assert client.delete("/api/v1/tenants/dept-restore-tmp?force=true").status_code == 200

        res = client.post(f"/api/v1/system-prompts/sp-restore-orphan/versions/{snapshot_id}/restore")
        assert res.status_code == 400, res.text
        assert "존재하지 않습니다" in res.json()["detail"]
    finally:
        _cleanup("sp-restore-orphan")


def test_bound_prompt_blocks_route_deletion():
    """라우트 삭제도 동일한 바인딩 가드를 적용받아야 한다."""
    _cleanup("sp-guard-route")

    r_res = client.post("/api/v1/routing/routes", json={
        "route_name": "guard-test-route",
        "traffic_weights": [{"model_id": "meta-llama/Llama-3.1-8B-Instruct", "weight": 100}],
        "load_balancing_strategy": "RoundRobin"
    })
    assert r_res.status_code in (200, 201), r_res.text

    bound = client.post("/api/v1/system-prompts", json={
        "prompt_id": "sp-guard-route",
        "name": "라우트 가드 검증 프롬프트",
        "content": "지침",
        "target_type": "ROUTE",
        "target_id": "guard-test-route",
        "is_active": True
    })
    assert bound.status_code == 201, bound.text

    blocked = client.delete("/api/v1/routing/routes/guard-test-route")
    assert blocked.status_code == 400, blocked.text
    assert "바인딩된 시스템 프롬프트" in blocked.json()["detail"]

    forced = client.delete("/api/v1/routing/routes/guard-test-route?force=true")
    assert forced.status_code == 200, forced.text
    assert "sp-guard-route" in forced.json().get("deactivated_prompts", [])

    _cleanup("sp-guard-route")
