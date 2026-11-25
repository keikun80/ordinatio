from fastapi.testclient import TestClient
from app.main import app
from app.models.tenant import Tenant
from app.models.virtual_key import VirtualKey
from app.core.security import verify_virtual_key
from tests.conftest import TestSessionLocal

client = TestClient(app)

def test_tenant_lifecycle():
    # 1. List tenants
    res = client.get("/api/v1/tenants")
    assert res.status_code == 200
    tenants = res.json()
    assert len(tenants) >= 1
    wm_tenant = next((t for t in tenants if t["tenant_id"] == "dept-wm"), None)
    assert wm_tenant is not None
    assert wm_tenant["department_code"] == "WM-01"

    # 2. Create a new tenant
    create_res = client.post(
        "/api/v1/tenants",
        json={
            "name": "여신심사부",
            "department_code": "LOAN-02",
            "monthly_budget_krw": 25000000.00,
            "is_hard_cap_enabled": True
        }
    )
    assert create_res.status_code == 201
    created = create_res.json()
    assert created["tenant_id"] == "dept-loan-02"
    assert created["name"] == "여신심사부"

    # 3. Duplicate department code check
    dup_res = client.post(
        "/api/v1/tenants",
        json={"name": "중복부서", "department_code": "LOAN-02"}
    )
    assert dup_res.status_code == 409

    # 4. Get tenant details
    get_res = client.get("/api/v1/tenants/dept-loan-02")
    assert get_res.status_code == 200
    assert get_res.json()["name"] == "여신심사부"

    # 5. Update tenant (PATCH)
    patch_res = client.patch(
        "/api/v1/tenants/dept-loan-02",
        json={"name": "여신심사혁신부", "monthly_budget_krw": 30000000.00, "is_hard_cap_enabled": False}
    )
    assert patch_res.status_code == 200
    patched = patch_res.json()
    assert patched["name"] == "여신심사혁신부"
    assert float(patched["monthly_budget_krw"]) == 30000000.00
    assert patched["is_hard_cap_enabled"] is False

    # 6. Delete tenant (DELETE)
    del_res = client.delete("/api/v1/tenants/dept-loan-02")
    assert del_res.status_code == 200
    assert del_res.json()["tenant_id"] == "dept-loan-02"
    get_after_del = client.get("/api/v1/tenants/dept-loan-02")
    assert get_after_del.status_code == 404

def test_virtual_key_creation_one_time_exposure_and_argon2_hashing():
    # 1. Create a virtual key
    payload = {
        "name": "PB 맞춤형 자산 리밸런싱 에이전트",
        "tenant_id": "dept-wm",
        "allowed_models": ["meta-llama/Llama-3.1-8B-Instruct"],
        "allowed_ip_cidrs": ["10.100.0.0/16"],
        "rpm_limit": 300,
        "tpm_limit": 300000
    }
    res = client.post("/api/v1/virtual-keys", json=payload)
    assert res.status_code == 201
    data = res.json()

    # Verify single-exposure plaintext token
    assert "raw_key" in data
    raw_key = data["raw_key"]
    assert raw_key.startswith("sk-ord-")
    assert len(raw_key) > 30

    # Verify key prefix
    assert data["key_prefix"] == raw_key[:16]
    assert data["tenant_id"] == "dept-wm"
    assert data["is_active"] is True
    assert "security_notice" in data

    # 2. Inspect DB directly: Confirm raw_key is NEVER stored in plaintext
    db = TestSessionLocal()
    db_record = db.query(VirtualKey).filter(VirtualKey.key_id == data["key_id"]).first()
    assert db_record is not None
    assert db_record.key_hash != raw_key
    assert "$argon2" in db_record.key_hash
    assert verify_virtual_key(raw_key, db_record.key_hash) is True
    db.close()

def test_virtual_key_listing_does_not_leak_raw_key():
    # Create key
    client.post(
        "/api/v1/virtual-keys",
        json={
            "name": "보안 테스트 키",
            "tenant_id": "dept-wm",
            "allowed_models": ["meta-llama/Llama-3.1-8B-Instruct"]
        }
    )

    # List keys
    res = client.get("/api/v1/virtual-keys")
    assert res.status_code == 200
    items = res.json()
    assert len(items) >= 1
    first_item = items[0]

    # Verify sensitive fields are NOT in listing
    assert "raw_key" not in first_item
    assert "key_hash" not in first_item
    assert "key_prefix" in first_item

def test_virtual_key_validation_and_model_authorization():
    # 1. Create key with specific allowed model
    create_res = client.post(
        "/api/v1/virtual-keys",
        json={
            "name": "모델 인가 테스트 키",
            "tenant_id": "dept-wm",
            "allowed_models": ["meta-llama/Llama-3.1-8B-Instruct"],
            "rpm_limit": 120,
            "tpm_limit": 150000
        }
    )
    assert create_res.status_code == 201
    raw_key = create_res.json()["raw_key"]

    # 2. Validate with allowed model
    valid_res = client.post(
        "/api/v1/virtual-keys/validate",
        json={"raw_key": raw_key, "model_id": "meta-llama/Llama-3.1-8B-Instruct"}
    )
    assert valid_res.status_code == 200
    assert valid_res.json()["valid"] is True
    assert valid_res.json()["tenant_id"] == "dept-wm"
    assert valid_res.json()["rpm_limit"] == 120

    # 3. Validate with unauthorized model
    unauth_res = client.post(
        "/api/v1/virtual-keys/validate",
        json={"raw_key": raw_key, "model_id": "unauthorized-llm/405B"}
    )
    assert unauth_res.status_code == 200
    assert unauth_res.json()["valid"] is False
    assert "권한이 없습니다" in unauth_res.json()["reason"]

    # 4. Validate with invalid key
    invalid_res = client.post(
        "/api/v1/virtual-keys/validate",
        json={"raw_key": "sk-ord-invalid00000000000000000000000"}
    )
    assert invalid_res.status_code == 200
    assert invalid_res.json()["valid"] is False

def test_virtual_key_revoke_lifecycle():
    # 1. Create key
    create_res = client.post(
        "/api/v1/virtual-keys",
        json={"name": "회수 테스트 키", "tenant_id": "dept-wm"}
    )
    key_data = create_res.json()
    key_id = key_data["key_id"]
    raw_key = key_data["raw_key"]

    # Initial validation is valid
    assert client.post("/api/v1/virtual-keys/validate", json={"raw_key": raw_key}).json()["valid"] is True

    # 2. Revoke key
    revoke_res = client.patch(
        f"/api/v1/virtual-keys/{key_id}/revoke",
        json={"revoked_reason": "보안 담당자 긴급 직권 파기"}
    )
    assert revoke_res.status_code == 200
    assert revoke_res.json()["is_active"] is False
    assert revoke_res.json()["revoked_reason"] == "보안 담당자 긴급 직권 파기"

    # 3. Validation should now fail immediately
    post_revoke_val = client.post(
        "/api/v1/virtual-keys/validate",
        json={"raw_key": raw_key}
    )
    assert post_revoke_val.status_code == 200
    val_data = post_revoke_val.json()
    assert val_data["valid"] is False
    assert "차단/파기된 가상키" in val_data["reason"]

def test_virtual_key_update_lifecycle():
    # 1. Create key
    create_res = client.post(
        "/api/v1/virtual-keys",
        json={"name": "초기 명칭", "tenant_id": "dept-wm", "rpm_limit": 100, "tpm_limit": 100000}
    )
    key_id = create_res.json()["key_id"]

    # 2. Update key settings
    update_res = client.patch(
        f"/api/v1/virtual-keys/{key_id}",
        json={
            "name": "수정된 명칭",
            "rpm_limit": 500,
            "tpm_limit": 600000,
            "allowed_ip_cidrs": ["10.200.0.0/16"]
        }
    )
    assert update_res.status_code == 200
    updated_data = update_res.json()
    assert updated_data["name"] == "수정된 명칭"
    assert updated_data["rpm_limit"] == 500
    assert updated_data["tpm_limit"] == 600000
    assert "10.200.0.0/16" in updated_data["allowed_ip_cidrs"]

    # 3. Verify changes persist on GET
    get_res = client.get(f"/api/v1/virtual-keys?search=수정된")
    assert get_res.status_code == 200
    matches = get_res.json()
    assert len(matches) == 1
    assert matches[0]["key_id"] == key_id
    assert matches[0]["name"] == "수정된 명칭"


def test_virtual_key_delete_lifecycle():
    # 1. Create active key
    create_res = client.post(
        "/api/v1/virtual-keys",
        json={"name": "삭제 테스트용 키", "tenant_id": "dept-wm", "rpm_limit": 60, "tpm_limit": 50000}
    )
    assert create_res.status_code == 201
    key_id = create_res.json()["key_id"]

    # 2. Attempt to delete ACTIVE key -> Should fail with 400 Bad Request
    del_active_res = client.delete(f"/api/v1/virtual-keys/{key_id}")
    assert del_active_res.status_code == 400
    assert "활성 상태" in del_active_res.json()["detail"]

    # 3. Revoke the key
    revoke_res = client.patch(
        f"/api/v1/virtual-keys/{key_id}/revoke",
        json={"revoked_reason": "삭제 전 파기 테스트"}
    )
    assert revoke_res.status_code == 200
    assert revoke_res.json()["is_active"] is False

    # 4. Now delete the REVOKED key -> Should succeed with 200 OK
    del_revoked_res = client.delete(f"/api/v1/virtual-keys/{key_id}")
    assert del_revoked_res.status_code == 200
    assert del_revoked_res.json()["key_id"] == key_id
    assert "영구 삭제되었습니다" in del_revoked_res.json()["message"]

    # 5. Verify the key no longer exists on GET
    get_res = client.get(f"/api/v1/virtual-keys?search=삭제 테스트용")
    assert get_res.status_code == 200
    assert len(get_res.json()) == 0

    # 6. Second delete attempt -> Should return 404 Not Found
    del_again_res = client.delete(f"/api/v1/virtual-keys/{key_id}")
    assert del_again_res.status_code == 404


def test_virtual_key_validate_ip_cidr_enforcement():
    # 1. Create key bound to strict CIDR (10.50.0.0/16)
    create_res = client.post(
        "/api/v1/virtual-keys",
        json={
            "name": "IP 제한 테스트 키",
            "tenant_id": "dept-wm",
            "allowed_ip_cidrs": ["10.50.0.0/16"]
        }
    )
    assert create_res.status_code == 201
    raw_key = create_res.json()["raw_key"]

    # 2. Validate with matching IP
    valid_res = client.post(
        "/api/v1/virtual-keys/validate",
        json={"raw_key": raw_key, "client_ip": "10.50.12.34"}
    )
    assert valid_res.status_code == 200
    assert valid_res.json()["valid"] is True

    # 3. Validate with unauthorized IP
    unauth_res = client.post(
        "/api/v1/virtual-keys/validate",
        json={"raw_key": raw_key, "client_ip": "192.168.1.100"}
    )
    assert unauth_res.status_code == 200
    assert unauth_res.json()["valid"] is False
    assert "접속이 허용되지 않은" in unauth_res.json()["reason"]

    # 4. Validate with missing client_ip
    missing_ip_res = client.post(
        "/api/v1/virtual-keys/validate",
        json={"raw_key": raw_key}
    )
    assert missing_ip_res.status_code == 200
    assert missing_ip_res.json()["valid"] is False
    assert "클라이언트 IP 정보가 누락" in missing_ip_res.json()["reason"]


def test_rpm_rate_limiter():
    from app.core.token_limiter import TokenRateLimiter
    limiter = TokenRateLimiter()
    test_key = "test-key-rpm-limit"

    # Consume up to limit (3 req/min)
    allowed1, cnt1, rem1 = limiter.check_and_consume_rpm(test_key, rpm_limit=3)
    assert allowed1 is True
    assert cnt1 == 1

    allowed2, cnt2, rem2 = limiter.check_and_consume_rpm(test_key, rpm_limit=3)
    assert allowed2 is True
    assert cnt2 == 2

    allowed3, cnt3, rem3 = limiter.check_and_consume_rpm(test_key, rpm_limit=3)
    assert allowed3 is True
    assert cnt3 == 3

    # 4th request should be rejected (429)
    allowed4, cnt4, rem4 = limiter.check_and_consume_rpm(test_key, rpm_limit=3)
    assert allowed4 is False
    assert cnt4 == 3
    assert rem4 == 0


def test_tpm_rate_limiter():
    from app.core.token_limiter import TokenRateLimiter
    limiter = TokenRateLimiter()
    test_key = "test-key-tpm-limit"

    # Consume 150,000 tokens out of 200,000 TPM limit
    allowed1, current1, rem1 = limiter.check_and_consume(test_key, requested_tokens=150000, tpm_limit=200000)
    assert allowed1 is True
    assert current1 == 150000
    assert rem1 == 50000

    # Requesting another 60,000 tokens should be blocked (would exceed 200,000)
    allowed2, current2, rem2 = limiter.check_and_consume(test_key, requested_tokens=60000, tpm_limit=200000)
    assert allowed2 is False
    assert current2 == 150000  # Usage not incremented when blocked
    assert rem2 == 50000

    # Requesting 40,000 tokens fits within remaining 50,000
    allowed3, current3, rem3 = limiter.check_and_consume(test_key, requested_tokens=40000, tpm_limit=200000)
    assert allowed3 is True
    assert current3 == 190000
    assert rem3 == 10000


def test_tenant_reset_spent_budget():
    # 1. Update spent budget directly on existing tenant
    db = TestSessionLocal()
    tenant = db.query(Tenant).filter(Tenant.tenant_id == "dept-wm").first()
    assert tenant is not None
    tenant.spent_budget_krw = 9999999.00
    db.commit()
    db.close()

    # Verify spent_budget is reflected
    res = client.get("/api/v1/tenants/dept-wm")
    assert res.status_code == 200
    assert float(res.json()["spent_budget_krw"]) == 9999999.00

    # 2. Reset spent budget via POST /api/v1/tenants/{id}/reset-spent
    reset_res = client.post("/api/v1/tenants/dept-wm/reset-spent")
    assert reset_res.status_code == 200
    assert float(reset_res.json()["spent_budget_krw"]) == 0.0

    # Verify persistent state in DB
    check_res = client.get("/api/v1/tenants/dept-wm")
    assert check_res.status_code == 200
    assert float(check_res.json()["spent_budget_krw"]) == 0.0



