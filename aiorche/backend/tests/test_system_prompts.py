import pytest
from fastapi.testclient import TestClient
from app.main import app
from tests.conftest import TestSessionLocal
from app.models.system_prompt import SystemPrompt

client = TestClient(app)

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

    # 4. Delete
    del_res = client.delete("/api/v1/system-prompts/sp-api-test-01")
    assert del_res.status_code == 200

    # 5. Confirm 404
    get_again = client.get("/api/v1/system-prompts/sp-api-test-01")
    assert get_again.status_code == 404

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
