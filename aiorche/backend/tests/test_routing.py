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

    # 2. Register a new model
    new_model = {
        "model_id": "Upstage/Solar-Pro-22B-Instruct",
        "alias": "solar-pro-financial",
        "backend_infra": "EKS",
        "target_endpoint": "http://vllm-solar-pro.ai-serving:8000",
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

    # 3. Get model details
    get_res = client.get(f"/api/v1/models/{new_model['model_id']}")
    assert get_res.status_code == 200
    assert get_res.json()["backend_infra"] == "EKS"

    # 4. Update model
    patch_res = client.patch(
        f"/api/v1/models/{new_model['model_id']}",
        json={"input_price_per_1k": 1.4000, "is_active": False}
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["input_price_per_1k"] == 1.4
    assert patch_res.json()["is_active"] is False

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
