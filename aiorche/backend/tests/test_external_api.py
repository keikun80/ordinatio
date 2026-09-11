from decimal import Decimal
from fastapi.testclient import TestClient
from app.main import app
from app.models.tenant import Tenant
from app.models.virtual_key import VirtualKey
from tests.conftest import TestSessionLocal

client = TestClient(app)

def test_client_self_inspection_me_and_models():
    # 1. Create a test virtual key
    create_res = client.post(
        "/api/v1/virtual-keys",
        json={
            "name": "RAG 지식검색 에이전트",
            "tenant_id": "dept-ai-lab",
            "allowed_models": ["meta-llama/Llama-3.1-8B-Instruct"],
            "rpm_limit": 250,
            "tpm_limit": 250000
        }
    )
    assert create_res.status_code == 201
    raw_key = create_res.json()["raw_key"]

    # 2. Client calls /external/me with Authorization header
    me_res = client.get(
        "/api/v1/external/me",
        headers={"Authorization": f"Bearer {raw_key}"}
    )
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data["name"] == "RAG 지식검색 에이전트"
    assert me_data["tenant_id"] == "dept-ai-lab"
    assert me_data["tenant_name"] == "AI융합기술연구소"
    assert me_data["rpm_limit"] == 250
    assert "meta-llama/Llama-3.1-8B-Instruct" in me_data["allowed_models"]

    # 3. Client calls /external/models to see allowed models
    models_res = client.get(
        "/api/v1/external/models",
        headers={"Authorization": f"Bearer {raw_key}"}
    )
    assert models_res.status_code == 200
    models_data = models_res.json()
    assert len(models_data) == 1
    assert models_data[0]["model_id"] == "meta-llama/Llama-3.1-8B-Instruct"

    # 4. Unauthorized request without header should fail
    unauth_res = client.get("/api/v1/external/me")
    assert unauth_res.status_code == 401

def test_gateway_usage_reporting_and_cost_aggregation():
    # 1. Create key
    create_res = client.post(
        "/api/v1/virtual-keys",
        json={
            "name": "텔레메트리 테스트 봇",
            "tenant_id": "dept-ai-lab"
        }
    )
    key_data = create_res.json()
    key_id = key_data["key_id"]

    # 2. Gateway reports usage (500 prompt, 1000 completion)
    report_res = client.post(
        "/api/v1/external/usage/report",
        json={
            "key_id": key_id,
            "model_id": "meta-llama/Llama-3.1-8B-Instruct",
            "prompt_tokens": 500,
            "completion_tokens": 1000,
            "latency_ms": 32.4
        }
    )
    assert report_res.status_code == 200
    rep_data = report_res.json()
    assert rep_data["success"] is True
    assert rep_data["added_tokens"] == 1500
    # Cost = 500 * 0.0008 + 1000 * 0.0024 = 0.4 + 2.4 = 2.8 KRW
    assert float(rep_data["added_cost_krw"]) == 2.8
    assert float(rep_data["key_total_spent_krw"]) == 2.8
    assert float(rep_data["tenant_total_spent_krw"]) == 2.8
    assert rep_data["is_hard_cap_reached"] is False

    # 3. Second usage report
    report_res2 = client.post(
        "/api/v1/external/usage/report",
        json={
            "key_id": key_id,
            "prompt_tokens": 1000,
            "completion_tokens": 1000,
            "latency_ms": 40.0
        }
    )
    assert report_res2.status_code == 200
    # 1000 * 0.0008 + 1000 * 0.0024 = 0.8 + 2.4 = 3.2 KRW -> total 2.8 + 3.2 = 6.0 KRW
    assert float(report_res2.json()["key_total_spent_krw"]) == 6.0
    assert float(report_res2.json()["tenant_total_spent_krw"]) == 6.0

def test_erp_tenant_budget_and_summary():
    # 1. Check initial summary
    sum_res = client.get("/api/v1/external/tenants/dept-ai-lab/summary")
    assert sum_res.status_code == 200
    sum_data = sum_res.json()
    assert sum_data["tenant_id"] == "dept-ai-lab"
    assert float(sum_data["monthly_budget_krw"]) == 10000000.00

    # 2. ERP updates department budget to 30,000,000 KRW
    patch_res = client.patch(
        "/api/v1/external/tenants/dept-ai-lab/budget",
        json={
            "monthly_budget_krw": 30000000.00,
            "is_hard_cap_enabled": False
        }
    )
    assert patch_res.status_code == 200
    patched_data = patch_res.json()
    assert float(patched_data["monthly_budget_krw"]) == 30000000.00
    assert patched_data["is_hard_cap_enabled"] is False

def test_prometheus_metrics_scrape():
    # Create key and record usage
    create_res = client.post(
        "/api/v1/virtual-keys",
        json={"name": "프로메테우스 테스트 키", "tenant_id": "dept-ai-lab"}
    )
    key_id = create_res.json()["key_id"]
    client.post(
        "/api/v1/external/usage/report",
        json={"key_id": key_id, "prompt_tokens": 100, "completion_tokens": 200}
    )

    # Scrape /metrics
    res = client.get("/metrics")
    assert res.status_code == 200
    assert "text/plain" in res.headers["content-type"]
    text = res.text
    assert "aiorche_virtual_keys_total" in text
    assert "aiorche_active_keys_total" in text
    assert "aiorche_tokens_total" in text
    assert "aiorche_tenant_budget_krw" in text
    assert "aiorche_tenant_spent_krw" in text
    assert "aiorche_cost_total_krw" in text
