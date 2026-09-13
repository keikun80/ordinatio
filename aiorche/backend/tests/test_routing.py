from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_model_catalog_crud():
    # 1. List models
    res = client.get("/api/v1/models")
    assert res.status_code == 200
    models = res.json()
    assert len(models) >= 2
    model_ids = [m["model_id"] for m in models]
    assert "meta-llama/Llama-3.1-8B-Instruct" in model_ids

    # 2. Register a new model (Ollama direct)
    new_model = {
        "model_id": "Upstage/Solar-Pro-22B-Instruct",
        "alias": "solar-pro-financial",
        "backend_infra": "On-Prem K8s",
        "serving_engine": "Ollama",
        "execution_method": "direct",
        "target_endpoint": "http://127.0.0.1:11434",
        "input_price_per_1k": 1.5000,
        "output_price_per_1k": 4.5000,
        "cache_discount_ratio": 0.3000,
        "is_active": True
    }
    create_res = client.post("/api/v1/models", json=new_model)
    assert create_res.status_code == 201
    created_data = create_res.json()
    assert created_data["model_id"] == new_model["model_id"]
    assert created_data["alias"] == "solar-pro-financial"
    assert created_data["serving_engine"] == "Ollama"
    assert created_data["execution_method"] == "direct"

    # 3. Get model details
    get_res = client.get(f"/api/v1/models/{new_model['model_id']}")
    assert get_res.status_code == 200
    assert get_res.json()["backend_infra"] == "On-Prem K8s"
    assert get_res.json()["serving_engine"] == "Ollama"
    assert get_res.json()["execution_method"] == "direct"

    # 4. Update model
    patch_res = client.patch(
        f"/api/v1/models/{new_model['model_id']}",
        json={"input_price_per_1k": 1.4000, "serving_engine": "vLLM", "execution_method": "k8s", "is_active": False}
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["input_price_per_1k"] == 1.4
    assert patch_res.json()["serving_engine"] == "vLLM"
    assert patch_res.json()["execution_method"] == "k8s"
    assert patch_res.json()["is_active"] is False

    # 5. Delete model (referenced in active route fails with 400)
    del_fail_res = client.delete("/api/v1/models/meta-llama/Llama-3.1-8B-Instruct")
    assert del_fail_res.status_code == 400
    assert "활성 라우트 정책" in del_fail_res.json()["detail"]

    # 6. Delete unreferenced model succeeds
    del_ok_res = client.delete(f"/api/v1/models/{new_model['model_id']}")
    assert del_ok_res.status_code == 200
    assert del_ok_res.json()["status"] == "success"

    # 7. Verify model is gone
    get_gone_res = client.get(f"/api/v1/models/{new_model['model_id']}")
    assert get_gone_res.status_code == 404

def test_routing_policy_get_active():
    res = client.get("/api/v1/routing")
    assert res.status_code == 200
    data = res.json()
    assert "policy_id" in data
    assert "route_name" in data
    assert "traffic_weights" in data
    assert "xds_revision" in data
    assert data["xds_revision"].startswith("xds-rev-")

def test_dry_run_validation():
    # 1. Valid 80:20 weights
    valid_payload = {
        "traffic_weights": [
            {"model_id": "meta-llama/Llama-3.1-8B-Instruct", "weight": 80},
            {"model_id": "meta-llama/Llama-3.1-8B-FineTuned-v2", "weight": 20}
        ]
    }
    res = client.post("/api/v1/routing/dry-run", json=valid_payload)
    assert res.status_code == 200
    data = res.json()
    assert data["is_valid"] is True
    assert data["total_weight"] == 100
    assert len(data["validation_errors"]) == 0
    assert data["active_endpoints_count"] == 2

    # 2. Invalid weights (sum != 100)
    invalid_weight_payload = {
        "traffic_weights": [
            {"model_id": "meta-llama/Llama-3.1-8B-Instruct", "weight": 70},
            {"model_id": "meta-llama/Llama-3.1-8B-FineTuned-v2", "weight": 10}
        ]
    }
    res2 = client.post("/api/v1/routing/dry-run", json=invalid_weight_payload)
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["is_valid"] is False
    assert data2["total_weight"] == 80
    assert any("100%" in err for err in data2["validation_errors"])

    # 3. Non-existent model ID
    ghost_payload = {
        "traffic_weights": [
            {"model_id": "non-existent-model-xyz", "weight": 100}
        ]
    }
    res3 = client.post("/api/v1/routing/dry-run", json=ghost_payload)
    assert res3.status_code == 200
    data3 = res3.json()
    assert data3["is_valid"] is False
    assert any("존재하지 않습니다" in err for err in data3["validation_errors"])

def test_canary_deployment_lifecycle():
    # 1. Deploy 60:40 canary split
    deploy_payload = {
        "route_name": "financial-advisor-v1",
        "traffic_weights": [
            {"model_id": "meta-llama/Llama-3.1-8B-Instruct", "weight": 60},
            {"model_id": "meta-llama/Llama-3.1-8B-FineTuned-v2", "weight": 40}
        ],
        "load_balancing_strategy": "LeastQueueDepth",
        "failover_model_id": "meta-llama/Llama-3.1-70B-Instruct",
        "deployed_by": "sec-ops-lead"
    }
    res = client.post("/api/v1/routing/deploy", json=deploy_payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["envoy_ack"] is True
    new_rev = data["xds_revision"]
    assert new_rev.startswith("xds-rev-")

    # 2. Verify active routing returns this newly deployed revision
    active_res = client.get("/api/v1/routing")
    assert active_res.status_code == 200
    active_data = active_res.json()
    assert active_data["xds_revision"] == new_rev
    assert active_data["traffic_weights"] == [
        {"model_id": "meta-llama/Llama-3.1-8B-Instruct", "weight": 60},
        {"model_id": "meta-llama/Llama-3.1-8B-FineTuned-v2", "weight": 40}
    ]

    # 3. Verify history endpoint
    history_res = client.get("/api/v1/routing/history")
    assert history_res.status_code == 200
    history = history_res.json()
    assert len(history) >= 1
    assert history[0]["xds_revision"] == new_rev

def test_xds_discovery_routes_endpoint():
    res = client.get("/api/v1/xds/v3/discovery:routes")
    assert res.status_code == 200
    data = res.json()
    assert "version_info" in data
    assert "resources" in data
    assert len(data["resources"]) >= 1

    rc = data["resources"][0]
    assert rc["name"] == "local_ai_route"
    assert "virtual_hosts" in rc
    vh = rc["virtual_hosts"][0]
    assert vh["name"] == "ai_service"
    
    # Check that /v1/chat/completions route has weighted_clusters
    completions_route = next(r for r in vh["routes"] if r.get("match", {}).get("prefix") == "/v1/chat/completions")
    assert "weighted_clusters" in completions_route["route"]
    wc = completions_route["route"]["weighted_clusters"]
    assert wc["total_weight"] == 100
    assert len(wc["clusters"]) >= 2

def test_multi_route_crud_and_xds_compilation():
    # 1. List all routes
    res = client.get("/api/v1/routing/routes")
    assert res.status_code == 200
    routes = res.json()
    assert len(routes) >= 1

    # 2. Create a 3-way multi-model route
    new_route_payload = {
        "route_name": "customer-care-tier1",
        "traffic_weights": [
            {"model_id": "meta-llama/Llama-3.1-8B-Instruct", "weight": 50},
            {"model_id": "meta-llama/Llama-3.1-8B-FineTuned-v2", "weight": 30},
            {"model_id": "meta-llama/Llama-3.1-70B-Instruct", "weight": 20}
        ],
        "load_balancing_strategy": "LeastQueueDepth",
        "failover_chain": ["meta-llama/Llama-3.1-70B-Instruct"],
        "match_conditions": {
            "tenant_codes": ["WM-01", "LOAN-01"],
            "path_prefix": "/v1/routes/customer-care"
        },
        "priority": 5,
        "is_active": True,
        "description": "VIP 고객 상담 3-way 동적 가중치 분할 라우트"
    }
    create_res = client.post("/api/v1/routing/routes", json=new_route_payload)
    assert create_res.status_code == 201
    created_data = create_res.json()
    assert created_data["route_name"] == "customer-care-tier1"
    assert len(created_data["traffic_weights"]) == 3
    assert created_data["priority"] == 5

    # 3. Dry run with 3 models and failover chain
    dry_payload = {
        "route_name": "customer-care-tier1",
        "traffic_weights": created_data["traffic_weights"],
        "failover_chain": ["meta-llama/Llama-3.1-70B-Instruct"],
        "match_conditions": created_data["match_conditions"]
    }
    dry_res = client.post("/api/v1/routing/dry-run", json=dry_payload)
    assert dry_res.status_code == 200
    assert dry_res.json()["is_valid"] is True
    assert dry_res.json()["total_weight"] == 100

    # 4. Check that xDS RDS includes both prefix match and header matches
    xds_res = client.get("/api/v1/xds/v3/discovery:routes")
    assert xds_res.status_code == 200
    rc = xds_res.json()["resources"][0]
    vh_routes = rc["virtual_hosts"][0]["routes"]
    
    # Verify custom path prefix was added with prefix_rewrite
    custom_prefix_route = next((r for r in vh_routes if r.get("match", {}).get("prefix") == "/v1/routes/customer-care"), None)
    assert custom_prefix_route is not None
    assert custom_prefix_route["route"]["prefix_rewrite"] == "/v1/chat/completions"
    assert len(custom_prefix_route["route"]["weighted_clusters"]["clusters"]) == 3

    # Verify x-orche-route header matcher was added
    header_route = next(
        (r for r in vh_routes if any(
            h.get("name") == "x-orche-route" and h.get("string_match", {}).get("exact") == "customer-care-tier1"
            for h in r.get("match", {}).get("headers", [])
        )), None
    )
    assert header_route is not None
    assert len(header_route["route"]["weighted_clusters"]["clusters"]) == 3

    # 5. Update route (disable route)
    patch_res = client.put("/api/v1/routing/routes/customer-care-tier1", json={"is_active": False, "priority": 99})
    assert patch_res.status_code == 200
    assert patch_res.json()["is_active"] is False

def test_model_serving_health_check():
    # 1. Health check all models
    res = client.get("/api/v1/models/health-check")
    assert res.status_code == 200
    results = res.json()
    assert isinstance(results, list)
    assert len(results) >= 2

    first = results[0]
    assert "model_id" in first
    assert "alias" in first
    assert "serving_engine" in first
    assert "execution_method" in first
    assert "target_endpoint" in first
    assert "is_healthy" in first
    assert isinstance(first["is_healthy"], bool)
    assert "latency_ms" in first
    assert "checked_at" in first

    # 2. Check single model health (existing)
    model_id = first["model_id"]
    single_res = client.post(f"/api/v1/models/{model_id}/health")
    assert single_res.status_code == 200
    single_data = single_res.json()
    assert single_data["model_id"] == model_id
    assert isinstance(single_data["is_healthy"], bool)

    # 3. Check single model health (non-existent)
    not_found_res = client.post("/api/v1/models/non-existent-model-xyz/health")
    assert not_found_res.status_code == 404

def test_route_test_call_endpoint():
    # Test path-based call
    payload_path = {
        "route_name": "financial-advisor-v1",
        "method": "path",
        "message": "테스트 메시지"
    }
    res_path = client.post("/api/v1/routing/test-call", json=payload_path)
    assert res_path.status_code == 200
    data_path = res_path.json()
    assert "target_url" in data_path
    assert "latency_ms" in data_path
    assert "request_headers" in data_path
    assert data_path["dispatched_route"] == "financial-advisor-v1"

    # Test header-based call
    payload_header = {
        "route_name": "financial-advisor-v1",
        "method": "header",
        "message": "테스트 메시지"
    }
    res_header = client.post("/api/v1/routing/test-call", json=payload_header)
    assert res_header.status_code == 200
    data_header = res_header.json()
    assert data_header["request_headers"]["x-orche-route"] == "financial-advisor-v1"

    # Test non-existent route
    res_404 = client.post("/api/v1/routing/test-call", json={"route_name": "ghost-route", "method": "path"})
    assert res_404.status_code == 404


def test_gateway_openai_chat_completions_ingress():
    """Test OpenAI-compatible AI Gateway L7 endpoints (/v1/routes and /v1/chat/completions)"""
    # 1. Successful path-based route invocation
    chat_payload = {
        "messages": [
            {"role": "user", "content": "안녕하세요. 포트폴리오 자산 배분 조언을 요청합니다."}
        ],
        "temperature": 0.7,
        "max_tokens": 256
    }
    headers = {
        "Authorization": "Bearer sk-orch-your-virtual-key",
        "Content-Type": "application/json"
    }
    res = client.post("/v1/routes/financial-advisor-v1", json=chat_payload, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["object"] == "chat.completion"
    assert "choices" in data and len(data["choices"]) > 0
    assert "content" in data["choices"][0]["message"]
    assert "usage" in data
    assert "orche_metadata" in data
    assert data["orche_metadata"]["route_name"] == "financial-advisor-v1"

    # 2. Header-based chat completions
    header_call_headers = {
        "Authorization": "Bearer sk-orch-your-virtual-key",
        "Content-Type": "application/json",
        "x-orche-route": "financial-advisor-v1"
    }
    res_hc = client.post("/v1/chat/completions", json=chat_payload, headers=header_call_headers)
    assert res_hc.status_code == 200
    assert res_hc.json()["object"] == "chat.completion"

    # 3. Missing Authorization header -> 401
    res_unauth = client.post("/v1/routes/financial-advisor-v1", json=chat_payload)
    assert res_unauth.status_code == 401

    # 4. PII Blocking Rule triggered (EMP-AB12345) -> 403
    pii_blocked_payload = {
        "messages": [
            {"role": "user", "content": "담당자 사번 EMP-AB12345 계정으로 긴급 승인을 요청합니다."}
        ]
    }
    res_blocked = client.post("/v1/routes/financial-advisor-v1", json=pii_blocked_payload, headers=headers)
    assert res_blocked.status_code == 403

    # 5. List available models
    res_models = client.get("/v1/models")
    assert res_models.status_code == 200
    models_data = res_models.json()
    assert models_data["object"] == "list"
    assert len(models_data["data"]) > 0


