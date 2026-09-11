import pytest
from decimal import Decimal
from fastapi.testclient import TestClient
from app.main import app
from tests.conftest import TestSessionLocal
from app.models.tenant import Tenant
from app.models.virtual_key import VirtualKey
from app.core.security import generate_virtual_key, hash_virtual_key

client = TestClient(app)

def test_observability_metrics_summary():
    """Test REST API summary endpoint for Admin Overview metrics."""
    res = client.get("/api/v1/observability/metrics/summary")
    assert res.status_code == 200
    data = res.json()
    assert "current_rps" in data
    assert "current_tps" in data
    assert "p95_ttft_ms" in data
    assert "compute_pools" in data
    assert len(data["compute_pools"]) >= 3
    assert data["uptime_seconds"] >= 0

def test_observability_websocket_telemetry():
    """Test 1-second WebSocket telemetry streaming and ping-pong."""
    with client.websocket_connect("/api/v1/observability/ws") as ws:
        # 1. Receive initial pushed packet
        packet = ws.receive_json()
        assert "rps" in packet
        assert "tps" in packet
        assert "ttft_ms" in packet
        assert "cumulative_cost_krw" in packet
        assert "compute_pools" in packet
        assert packet["rps"] > 0
        assert packet["tps"] > 0

        # 2. Test ping-pong heartbeat
        ws.send_text("ping")
        received_pong = False
        for _ in range(5):
            msg = ws.receive_text()
            if msg == "pong":
                received_pong = True
                break
        assert received_pong is True

def test_observability_promql_proxy():
    """Test PromQL proxy query endpoint."""
    res = client.post(
        "/api/v1/observability/promql",
        json={"query": "sum(rate(ai_inference_requests_total[5m]))"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert "result" in data["data"]

def test_finops_overview_and_pricing():
    """Test FinOps overview, tenant budgets, and token pricing matrix."""
    res = client.get("/api/v1/finops/overview")
    assert res.status_code == 200
    data = res.json()
    assert "total_budget_krw" in data
    assert "total_spent_krw" in data
    assert "overall_burn_rate_pct" in data
    assert "pricing_matrix" in data
    assert data["pricing_matrix"]["standard_input_per_1k"] == 0.80
    assert data["pricing_matrix"]["standard_output_per_1k"] == 2.40
    assert len(data["tenants"]) >= 2

def test_finops_csv_invoice_export():
    """Test UTF-8 BOM CSV invoice generation and Korean Excel compatibility."""
    res = client.get("/api/v1/finops/invoices/export?month=2026-09")
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    assert 'attachment; filename="aiorche_invoice_2026-09.csv"' in res.headers["content-disposition"]
    
    # Verify UTF-8 BOM (\uFEFF)
    text = res.text
    assert text.startswith("\ufeff")
    
    # Verify CSV headers and content
    assert "부서ID,부서명,부서코드,월간예산(KRW),누적지출액(KRW)" in text
    assert "자산관리(WM)혁신부" in text
    assert "2026-09" in text

def test_hard_cap_enforcement_blocks_traffic():
    """Test that when a tenant exceeds 100% budget, Hard Cap blocks inference with HTTP 429."""
    db = TestSessionLocal()
    # 1. Setup tenant with 100% budget spent and Hard Cap enabled
    tenant = db.query(Tenant).filter(Tenant.tenant_id == "dept-wm").first()
    assert tenant is not None
    tenant.monthly_budget_krw = Decimal("10000000.00")
    tenant.spent_budget_krw = Decimal("10000000.00")  # 100% spent!
    tenant.is_hard_cap_enabled = True

    # 2. Create a virtual key for this tenant
    raw_key = generate_virtual_key()
    prefix = raw_key[:16]
    key_hash = hash_virtual_key(raw_key)
    vkey = VirtualKey(
        key_id="vk-hard-cap-test",
        key_hash=key_hash,
        key_prefix=prefix,
        tenant_id=tenant.tenant_id,
        name="Hard Cap Test Key",
        allowed_models=["meta-llama/Llama-3.1-8B-Instruct"],
        rpm_limit=60,
        tpm_limit=50000,
        is_active=True
    )
    db.merge(vkey)
    db.commit()
    db.close()

    # 3. Validation should be blocked with HTTP 429 Too Many Requests
    validate_res = client.post(
        "/api/v1/virtual-keys/validate",
        json={"raw_key": raw_key, "model_id": "meta-llama/Llama-3.1-8B-Instruct"}
    )
    assert validate_res.status_code == 429
    assert "TENANT_HARD_CAP_EXCEEDED" in validate_res.json()["detail"]

    # 4. Now disable Hard Cap (soft warning mode)
    db = TestSessionLocal()
    tenant = db.query(Tenant).filter(Tenant.tenant_id == "dept-wm").first()
    tenant.is_hard_cap_enabled = False
    db.commit()
    db.close()

    # 5. Validation should now SUCCEED (200 OK)
    soft_res = client.post(
        "/api/v1/virtual-keys/validate",
        json={"raw_key": raw_key, "model_id": "meta-llama/Llama-3.1-8B-Instruct"}
    )
    assert soft_res.status_code == 200
    assert soft_res.json()["valid"] is True
