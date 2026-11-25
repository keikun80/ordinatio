import pytest
from fastapi.testclient import TestClient
from app.main import app
from tests.conftest import TestSessionLocal
from app.models.system_prompt import SystemPrompt
from app.core.prompt_injector import (
    resolve_system_prompt_for_context,
    inject_system_prompt,
    resolve_and_inject_system_prompt
)
from app.core.ext_proc_server import ext_processor

client = TestClient(app)

def test_prompt_injector_resolution_hierarchy():
    """Verify 4-tier precedence: VIRTUAL_KEY > ROUTE > TENANT > GLOBAL."""
    with TestSessionLocal() as db:
        # 1. Global resolution
        p_global, by_global = resolve_system_prompt_for_context(db)
        assert p_global is not None
        assert by_global == "GLOBAL"
        assert p_global.prompt_id == "sp-global-guardrail"

        # 2. Tenant resolution
        p_tenant, by_tenant = resolve_system_prompt_for_context(db, tenant_id="dept-wm")
        assert p_tenant is not None
        assert by_tenant == "TENANT"
        assert p_tenant.prompt_id == "sp-wm-advisor"

        # 3. Route takes priority over Tenant
        p_route, by_route = resolve_system_prompt_for_context(
            db,
            route_name="code-copilot-v2",
            tenant_id="dept-wm"
        )
        assert p_route is not None
        assert by_route == "ROUTE"
        assert p_route.prompt_id == "sp-route-code"

        # 4. Virtual Key takes highest priority over Route and Tenant
        # Add temporary Virtual Key prompt
        db.query(SystemPrompt).filter(SystemPrompt.prompt_id == "sp-test-vkey").delete()
        db.add(SystemPrompt(
            prompt_id="sp-test-vkey",
            name="가상키 최고 우선순위 프롬프트",
            content="[가상키 전용 특별 지침]",
            target_type="VIRTUAL_KEY",
            target_id="vk-top-priority",
            injection_mode="PREPEND",
            is_active=True
        ))
        db.commit()

        p_vkey, by_vkey = resolve_system_prompt_for_context(
            db,
            key_id="vk-top-priority",
            route_name="code-copilot-v2",
            tenant_id="dept-wm"
        )
        assert p_vkey is not None
        assert by_vkey == "VIRTUAL_KEY"
        assert p_vkey.prompt_id == "sp-test-vkey"

        # Clean up
        db.query(SystemPrompt).filter(SystemPrompt.prompt_id == "sp-test-vkey").delete()
        db.commit()

def test_prompt_injector_modes():
    """Test PREPEND, OVERRIDE, FALLBACK_ONLY logic."""
    dummy_prepend = SystemPrompt(
        prompt_id="p-prep", name="P", content="[사내지침]",
        target_type="GLOBAL", injection_mode="PREPEND", is_active=True
    )
    dummy_override = SystemPrompt(
        prompt_id="p-over", name="O", content="[강제대체]",
        target_type="GLOBAL", injection_mode="OVERRIDE", is_active=True
    )
    dummy_fallback = SystemPrompt(
        prompt_id="p-fall", name="F", content="[기본대체]",
        target_type="GLOBAL", injection_mode="FALLBACK_ONLY", is_active=True
    )

    # 1. PREPEND with existing system message
    msgs = [{"role": "system", "content": "사용자지침"}, {"role": "user", "content": "질문"}]
    res_prep = inject_system_prompt(msgs, dummy_prepend)
    assert len(res_prep) == 2
    assert res_prep[0]["content"] == "[사내지침]\n\n사용자지침"

    # 2. OVERRIDE with existing system message
    res_over = inject_system_prompt(msgs, dummy_override)
    assert len(res_over) == 2
    assert res_over[0]["content"] == "[강제대체]"

    # 3. FALLBACK_ONLY with existing system message (no change)
    res_fall_no = inject_system_prompt(msgs, dummy_fallback)
    assert len(res_fall_no) == 2
    assert res_fall_no[0]["content"] == "사용자지침"

    # 4. FALLBACK_ONLY without system message (injects)
    user_only = [{"role": "user", "content": "질문"}]
    res_fall_yes = inject_system_prompt(user_only, dummy_fallback)
    assert len(res_fall_yes) == 2
    assert res_fall_yes[0]["role"] == "system"
    assert res_fall_yes[0]["content"] == "[기본대체]"

def test_ext_proc_server_injects_prompt_into_body():
    """Verify that ext_processor.process_request automatically injects system prompt and headers."""
    headers = {
        "authorization": "Bearer sk-ord-dev-key-12345",
        "x-orche-route": "code-copilot-v2",
        "x-session-id": "sess-test-01"
    }
    body = {
        "model": "meta-llama/Llama-3.1-70B-Instruct",
        "messages": [
            {"role": "user", "content": "SQL 쿼리 짜줘"}
        ]
    }

    res = ext_processor.process_request(headers=headers, body=body)
    assert res.status == "CONTINUE"
    assert res.status_code == 200

    # Verify headers to add
    assert "x-orche-prompt-injected" in res.headers_to_add
    assert res.headers_to_add["x-orche-prompt-injected"] == "sp-route-code"
    assert res.headers_to_add["x-orche-prompt-target"] == "ROUTE"

    # Verify body override
    assert res.body_override is not None
    assert "messages" in res.body_override
    injected_msgs = res.body_override["messages"]
    assert len(injected_msgs) == 2
    assert injected_msgs[0]["role"] == "system"
    assert "시큐어 코딩 지침" in injected_msgs[0]["content"]
    assert injected_msgs[1]["content"] == "SQL 쿼리 짜줘"

def test_developer_role_prompt_injection():
    """Verify that OpenAI o1/o3 'developer' role is correctly recognized and handled in PREPEND/OVERRIDE."""
    from app.core.prompt_injector import inject_system_prompt

    dummy_prepend = SystemPrompt(
        prompt_id="test-prepend",
        name="테스트 프리펜드",
        content="[주입된 보안 지침]",
        target_type="GLOBAL",
        injection_mode="PREPEND"
    )
    dummy_override = SystemPrompt(
        prompt_id="test-override",
        name="테스트 오버라이드",
        content="[강제 대체 지침]",
        target_type="GLOBAL",
        injection_mode="OVERRIDE"
    )

    # 1. Existing 'developer' role message in payload
    dev_msgs = [
        {"role": "developer", "content": "기존 개발자 지침"},
        {"role": "user", "content": "코드 짜줘"}
    ]

    # PREPEND should merge into existing developer message
    res_prep = inject_system_prompt(dev_msgs, dummy_prepend)
    assert len(res_prep) == 2
    assert res_prep[0]["role"] == "developer"
    assert "[주입된 보안 지침]" in res_prep[0]["content"]
    assert "기존 개발자 지침" in res_prep[0]["content"]

    # OVERRIDE should replace all system/developer messages
    res_over = inject_system_prompt(dev_msgs, dummy_override)
    assert len(res_over) == 2
    assert res_over[0]["role"] == "system"
    assert res_over[0]["content"] == "[강제 대체 지침]"
    assert res_over[1]["role"] == "user"

def test_dynamic_prompt_template_variables():
    """Verify {{date}}, {{route_name}}, {{tenant_name}} placeholder substitutions."""
    with TestSessionLocal() as db:
        prompt = SystemPrompt(
            prompt_id="sp-test-vars",
            name="동적 변수 템플릿 테스트",
            content="오늘 날짜는 {{date}}이며 라우트는 {{route_name}}, 테넌트는 {{tenant_id}}입니다.",
            target_type="ROUTE",
            target_id="test-route-vars",
            injection_mode="PREPEND",
            is_active=True
        )
        db.query(SystemPrompt).filter(SystemPrompt.prompt_id == "sp-test-vars").delete()
        db.add(prompt)
        db.commit()

        msgs, applied, resolved_by = resolve_and_inject_system_prompt(
            db=db,
            messages=[{"role": "user", "content": "안녕하세요"}],
            route_name="test-route-vars",
            tenant_id="dept-test"
        )
        assert applied is not None
        assert resolved_by == "ROUTE"
        sys_msg = msgs[0]["content"]
        import datetime
        today_str = datetime.datetime.now().strftime("%Y-%m-%d")
        assert f"오늘 날짜는 {today_str}" in sys_msg
        assert "라우트는 test-route-vars" in sys_msg
        assert "테넌트는 dept-test" in sys_msg

        # Clean up
        db.query(SystemPrompt).filter(SystemPrompt.prompt_id == "sp-test-vars").delete()
        db.commit()

def test_ext_proc_server_injects_prompt_for_virtual_key():
    """Verify that ext_proc matches virtual key target correctly."""
    with TestSessionLocal() as db:
        from app.models.virtual_key import VirtualKey
        from app.core.security import hash_virtual_key

        db.query(SystemPrompt).filter(SystemPrompt.prompt_id == "sp-vk-extproc").delete()
        db.query(VirtualKey).filter(VirtualKey.key_id == "vk-extproc-target").delete()

        raw_test_key = "sk-ord-extproc-test-key-12345"
        test_vk = VirtualKey(
            key_id="vk-extproc-target",
            name="ExtProc 테스트 가상키",
            key_hash=hash_virtual_key(raw_test_key),
            key_prefix=raw_test_key[:16],
            tenant_id="dept-wm",
            is_active=True
        )
        db.add(test_vk)

        prompt = SystemPrompt(
            prompt_id="sp-vk-extproc",
            name="가상키 ExtProc 전용 프롬프트",
            content="[가상키 특별 감사 지침]",
            target_type="VIRTUAL_KEY",
            target_id="vk-extproc-target",
            injection_mode="OVERRIDE",
            is_active=True
        )
        db.add(prompt)
        db.commit()

    headers = {
        "authorization": f"Bearer {raw_test_key}",
        "x-orche-route": "code-copilot-v2",
        "x-session-id": "sess-test-vk"
    }
    body = {
        "model": "meta-llama/Llama-3.1-70B-Instruct",
        "messages": [
            {"role": "system", "content": "기존 시스템 메시지"},
            {"role": "user", "content": "테스트 질문"}
        ]
    }

    res = ext_processor.process_request(headers=headers, body=body)
    assert res.status == "CONTINUE"
    assert res.headers_to_add.get("x-orche-prompt-injected") == "sp-vk-extproc"
    assert res.headers_to_add.get("x-orche-prompt-target") == "VIRTUAL_KEY"
    assert res.body_override is not None
    assert res.body_override["messages"][0]["content"] == "[가상키 특별 감사 지침]"

    # Clean up
    with TestSessionLocal() as db:
        db.query(SystemPrompt).filter(SystemPrompt.prompt_id == "sp-vk-extproc").delete()
        db.query(VirtualKey).filter(VirtualKey.key_id == "vk-extproc-target").delete()
        db.commit()

