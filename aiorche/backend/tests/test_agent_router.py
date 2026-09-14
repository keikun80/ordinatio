import pytest
from fastapi.testclient import TestClient

from app.core.agent_router import (
    AgentRouter,
    classify_prompt,
    ComplexityLevel,
    RoutingPolicyType,
    SessionAffinityManager,
    DEFAULT_FAST_MODEL,
    DEFAULT_REASONING_MODEL
)
from app.core.token_limiter import TokenRateLimiter
from app.core.ext_proc_server import ExtProcessorService

def test_classifier_light_intent():
    messages = [{"role": "user", "content": "안녕하세요! 오늘 서울 날씨 어때요?"}]
    result = classify_prompt(messages=messages)
    assert result.complexity == ComplexityLevel.LIGHT
    assert result.suggested_tier == "fast_8b"
    assert not result.has_tool_calling
    assert result.primary_intent == "light_conversation"

def test_classifier_coding_and_math_intent():
    coding_prompt = """
    def quicksort(arr):
        if len(arr) <= 1:
            return arr
        pivot = arr[len(arr) // 2]
        return quicksort([x for x in arr if x < pivot]) + [x for x in arr if x == pivot] + quicksort([x for x in arr if x > pivot])
    
    위 코드의 시간 복잡도와 최적화 방안을 단계별로 설명하고 수학적 점화식을 도출해줘.
    """
    messages = [{"role": "user", "content": coding_prompt}]
    result = classify_prompt(messages=messages)
    assert result.complexity == ComplexityLevel.REASONING_HEAVY
    assert result.suggested_tier == "reasoning_72b"
    assert any("Coding" in r or "reasoning" in r for r in result.reasons)

def test_classifier_tool_calling():
    messages = [{"role": "user", "content": "홍길동 계좌에서 10만원 송금해줘"}]
    tools = [
        {
            "type": "function",
            "function": {
                "name": "transfer_funds",
                "description": "Send funds to destination account"
            }
        }
    ]
    result = classify_prompt(messages=messages, tools=tools)
    assert result.complexity == ComplexityLevel.AGENT_WORKFLOW
    assert result.suggested_tier == "agent_worker"
    assert result.has_tool_calling

def test_policy_engine_quality_first():
    router = AgentRouter(default_policy=RoutingPolicyType.QUALITY_FIRST)

    # 1. Simple query -> Fast 8B
    light_res = classify_prompt([{"role": "user", "content": "환율이 얼마인가요?"}])
    dec1 = router.evaluate_route(light_res)
    assert dec1.selected_model == DEFAULT_FAST_MODEL
    assert dec1.target_cluster == "cluster_vllm_fast_8b"
    assert dec1.tier == "fast_8b"

    # 2. Deep reasoning query -> Reasoning 72B
    heavy_res = classify_prompt([{"role": "user", "content": "SELECT * FROM orders JOIN customers ... 이 SQL 인덱스를 최적화하고 실행계획을 분석해줘"}])
    dec2 = router.evaluate_route(heavy_res)
    assert dec2.selected_model == DEFAULT_REASONING_MODEL
    assert dec2.target_cluster == "cluster_vllm_reasoning_72b"
    assert dec2.tier == "reasoning_72b"

def test_policy_engine_least_cost_budget_cap():
    router = AgentRouter(default_policy=RoutingPolicyType.LEAST_COST)
    heavy_res = classify_prompt([{"role": "user", "content": "복잡한 알고리즘을 최적화하는 파이썬 코드를 작성해줘."}])

    # With normal budget (< 80%), heavy query gets Reasoning 72B
    dec_normal = router.evaluate_route(heavy_res, tenant_budget_spent_ratio=0.5)
    assert dec_normal.selected_model == DEFAULT_REASONING_MODEL

    # When budget spent ratio >= 80%, force downgrade to Fast 8B to minimize TCO
    dec_budget_alert = router.evaluate_route(heavy_res, tenant_budget_spent_ratio=0.85)
    assert dec_budget_alert.selected_model == DEFAULT_FAST_MODEL
    assert dec_budget_alert.target_cluster == "cluster_vllm_fast_8b"
    assert any("Budget alert" in r for r in dec_budget_alert.reasons)

def test_token_rate_limiter():
    limiter = TokenRateLimiter()
    key_id = "test-key-tpm-1"

    # Limit = 1000 tokens
    allowed1, usage1, rem1 = limiter.check_and_consume(key_id, requested_tokens=400, tpm_limit=1000)
    assert allowed1
    assert usage1 == 400
    assert rem1 == 600

    allowed2, usage2, rem2 = limiter.check_and_consume(key_id, requested_tokens=500, tpm_limit=1000)
    assert allowed2
    assert usage2 == 900
    assert rem2 == 100

    # Over quota (900 + 200 > 1000)
    allowed3, usage3, rem3 = limiter.check_and_consume(key_id, requested_tokens=200, tpm_limit=1000)
    assert not allowed3
    assert rem3 == 100

def test_session_affinity_manager():
    mgr = SessionAffinityManager(worker_slots=4)
    session_id = "session-wm-12345"
    worker_1 = mgr.compute_session_worker_id(session_id)
    worker_2 = mgr.compute_session_worker_id(session_id)
    assert worker_1 == worker_2
    assert worker_1.startswith("worker-")

    headers = mgr.get_affinity_headers(session_id=session_id, prompt_prefix="Hello AI")
    assert headers["x-agent-worker-affinity"] == worker_1
    assert headers["x-session-id"] == session_id
    assert "x-prompt-hash" in headers

def test_ext_processor_service():
    ext_svc = ExtProcessorService()
    req_headers = {
        "authorization": "Bearer sk-orch-dev-key-1234",
        "x-session-id": "session-test-01"
    }
    req_body = {
        "model": "agent-auto",
        "messages": [
            {"role": "user", "content": "간단한 안부 인사입니다. 오늘 수고 많으셨습니다."}
        ]
    }
    res = ext_svc.process_request(headers=req_headers, body=req_body)
    assert res.status == "CONTINUE"
    assert res.status_code == 200
    assert res.headers_to_add["x-orche-upstream-cluster"] == "cluster_vllm_fast_8b"
    assert res.headers_to_add["x-agent-complexity"] == "LIGHT"
    assert "x-agent-proc-time-ms" in res.headers_to_add

def test_gateway_agent_router_chat_completions(client: TestClient):
    # 1. Simple light query test
    payload_light = {
        "model": "agent-auto",
        "messages": [
            {"role": "user", "content": "안녕하세요, 코스피 지수가 어떻게 되나요?"}
        ]
    }
    res_light = client.post(
        "/v1/chat/completions",
        json=payload_light,
        headers={"Authorization": "Bearer sk-orch-test-key-developer"}
    )
    assert res_light.status_code == 200
    data_light = res_light.json()
    assert "choices" in data_light
    assert data_light["orche_metadata"]["routed_by"] == "Envoy AI Gateway + AgentRouter"
    assert data_light["orche_metadata"]["complexity"] == "LIGHT"
    assert data_light["orche_metadata"]["tier"] == "fast_8b"
    assert res_light.headers["x-agent-route-tier"] == "fast_8b"

    # 2. Complex coding query test
    payload_heavy = {
        "model": "agent-auto",
        "messages": [
            {"role": "user", "content": "```python\ndef fibonacci(n):\n  return n\n``` 위 재귀 함수를 메모이제이션 및 동적 계획법으로 최적화하고 시간복잡도를 분석해줘."}
        ]
    }
    res_heavy = client.post(
        "/v1/chat/completions",
        json=payload_heavy,
        headers={"Authorization": "Bearer sk-orch-test-key-developer"}
    )
    assert res_heavy.status_code == 200
    data_heavy = res_heavy.json()
    assert data_heavy["orche_metadata"]["complexity"] == "REASONING_HEAVY"
    assert data_heavy["orche_metadata"]["tier"] == "reasoning_72b"
    assert res_heavy.headers["x-agent-route-tier"] == "reasoning_72b"
    assert res_heavy.headers["x-orche-upstream-cluster"] == "cluster_vllm_reasoning_72b"

def test_routing_agent_router_status_and_simulate_apis(client: TestClient):
    # Status API
    status_res = client.get("/api/v1/routing/agent-router/status")
    assert status_res.status_code == 200
    st_data = status_res.json()
    assert st_data["status"] == "ACTIVE"
    assert "QualityFirst" in st_data["supported_policies"]
    assert "fast_8b" in st_data["default_tiers"]

    # Simulate API
    sim_res = client.post(
        "/api/v1/routing/agent-router/simulate",
        json={
            "prompt": "수학적 귀납법으로 오일러 공식을 증명하고 단계별 논리를 설명해줘.",
            "policy": "QualityFirst"
        }
    )
    assert sim_res.status_code == 200
    sim_data = sim_res.json()
    assert sim_data["complexity"] == "REASONING_HEAVY"
    assert sim_data["suggested_tier"] == "reasoning_72b"
    assert sim_data["target_cluster"] == "cluster_vllm_reasoning_72b"

def test_agent_router_policies_crud_and_dynamic_evaluation(client: TestClient):
    # 1. GET Policies
    res = client.get("/api/v1/routing/agent-router/policies")
    assert res.status_code == 200
    data = res.json()
    assert "policies" in data
    assert len(data["policies"]) == 4
    p_ids = [p["policy_id"] for p in data["policies"]]
    assert "QualityFirst" in p_ids
    assert "LeastCost" in p_ids
    assert "LatencyOptimized" in p_ids
    assert "SelfHealingFallback" in p_ids

    # 2. PUT Policy Update: customize LeastCost threshold to 50%
    policies = data["policies"]
    for p in policies:
        if p["policy_id"] == "LeastCost":
            p["config"]["budget_threshold_pct"] = 50.0
            p["config"]["economic_model"] = "custom-budget-saver-3b"
        elif p["policy_id"] == "QualityFirst":
            p["config"]["reasoning_model"] = "custom-deep-reasoner-99b"

    put_res = client.put(
        "/api/v1/routing/agent-router/policies",
        json={"policies": policies}
    )
    assert put_res.status_code == 200
    updated_data = put_res.json()
    least_cost_item = next(p for p in updated_data["policies"] if p["policy_id"] == "LeastCost")
    assert least_cost_item["config"]["budget_threshold_pct"] == 50.0
    assert least_cost_item["config"]["economic_model"] == "custom-budget-saver-3b"

    # 3. Verify that simulate reflects the updated policy settings!
    # Test LeastCost with 60% budget spent (exceeds new 50% threshold)
    sim_budget = client.post(
        "/api/v1/routing/agent-router/simulate",
        json={
            "prompt": "```python\ncomplex_code()\n```",
            "policy": "LeastCost",
            "budget_spent_ratio": 0.60
        }
    )
    assert sim_budget.status_code == 200
    sim_budget_data = sim_budget.json()
    assert sim_budget_data["selected_model"] == "custom-budget-saver-3b"
    assert "Budget alert active (60.0% spent >= 50% threshold)" in sim_budget_data["reasons"][1]

    # Test QualityFirst with custom reasoning model
    sim_q = client.post(
        "/api/v1/routing/agent-router/simulate",
        json={
            "prompt": "알고리즘 시간복잡도를 수학적으로 증명해줘.",
            "policy": "QualityFirst"
        }
    )
    assert sim_q.status_code == 200
    assert sim_q.json()["selected_model"] == "custom-deep-reasoner-99b"

