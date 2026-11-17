"""Phase 4: Compliance & PII Governance Unit/Integration Tests

Tests for:
1. PiiEngine unit tests (MASK, HASH, BLOCK, latency, hashes)
2. PII rules CRUD API (/api/v1/compliance/rules)
3. PII Simulation API (/api/v1/compliance/simulate) & WORM audit log creation
4. Audit Logs Forensics API (/api/v1/compliance/audit-logs)
5. Compliance Dashboard Stats API (/api/v1/compliance/stats)
"""
import json
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.pii_engine import PiiEngine, PiiRuleConfig, PiiDetection, PiiBlockedError

client = TestClient(app)


# =====================================================================
# 1. PiiEngine Unit Tests
# =====================================================================

def test_pii_engine_mask_action():
    engine = PiiEngine()
    engine.register_rule(
        PiiRuleConfig(
            rule_id="test-rrn",
            name="주민번호 테스트",
            entity_type="RRN",
            regex_pattern=r"\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])-[1-4]\d{6}",
            confidence_threshold=0.99,
            action="MASK"
        )
    )

    sample_text = "고객 주민번호는 900101-1234567 이며 확인 바랍니다."
    res = engine.mask(sample_text)

    assert not res.is_blocked
    assert res.original_text == sample_text
    assert "[MASKED_RRN]" in res.masked_text
    assert "900101-1234567" not in res.masked_text
    assert len(res.detections) == 1
    assert res.detections[0].entity_type == "RRN"
    assert res.detections[0].action == "MASK"
    assert res.original_hash.startswith("sha256:")
    assert res.masked_hash.startswith("sha256:")
    assert res.original_hash != res.masked_hash
    assert res.latency_ms < 50.0  # sub-millisecond or few ms


def test_pii_engine_hash_action():
    engine = PiiEngine()
    engine.register_rule(
        PiiRuleConfig(
            rule_id="test-acct",
            name="계좌번호 가명화",
            entity_type="BANK_ACCOUNT",
            regex_pattern=r"\b\d{3,6}-\d{2,6}-\d{3,6}\b",
            confidence_threshold=0.90,
            action="HASH"
        )
    )

    sample_text = "환불 계좌: 110-382-999412 로 입금 요청."
    res = engine.mask(sample_text)

    assert not res.is_blocked
    assert "[HASH_BANK_ACCOUNT_" in res.masked_text
    assert "110-382-999412" not in res.masked_text
    assert len(res.detections) == 1
    assert res.detections[0].action == "HASH"


def test_pii_engine_block_action():
    engine = PiiEngine()
    engine.register_rule(
        PiiRuleConfig(
            rule_id="test-emp",
            name="사번 유출 차단",
            entity_type="EMPLOYEE_ID",
            regex_pattern=r"\bEMP-[A-Z]{2}\d{5}\b",
            confidence_threshold=0.85,
            action="BLOCK"
        )
    )

    sample_text = "내부 감사 대상자 EMP-HQ12345 입니다."
    res = engine.mask(sample_text)

    assert res.is_blocked is True
    assert "[BLOCKED_BY_COMPLIANCE" in res.masked_text
    assert len(res.detections) == 1
    assert res.detections[0].action == "BLOCK"


def test_pii_engine_clean_text():
    engine = PiiEngine()
    engine.register_rule(
        PiiRuleConfig(
            rule_id="test-rrn",
            name="주민번호",
            entity_type="RRN",
            regex_pattern=r"\d{6}-[1-4]\d{6}",
            confidence_threshold=0.90,
            action="MASK"
        )
    )

    clean_text = "오늘의 코스피 지수는 2,650 포인트로 마감했습니다."
    res = engine.mask(clean_text)

    assert not res.is_blocked
    assert res.masked_text == clean_text
    assert len(res.detections) == 0
    assert res.original_hash == res.masked_hash


# =====================================================================
# 2. Compliance Rules API Integration Tests
# =====================================================================

def test_compliance_rules_crud():
    # 1. List existing rules (seeded in init_db)
    res = client.get("/api/v1/compliance/rules")
    assert res.status_code == 200
    rules = res.json()
    assert len(rules) >= 4

    # 2. Create new custom rule
    new_rule = {
        "rule_id": "pii-passport-test",
        "name": "여권번호 마스킹",
        "entity_type": "PASSPORT",
        "regex_pattern": r"[A-Z]{1}\d{8}",
        "confidence_threshold": 0.95,
        "action": "MASK",
        "is_active": True
    }
    create_res = client.post("/api/v1/compliance/rules", json=new_rule)
    assert create_res.status_code == 201
    created = create_res.json()
    assert created["rule_id"] == "pii-passport-test"
    assert created["entity_type"] == "PASSPORT"

    # 3. Duplicate ID conflict check
    dup_res = client.post("/api/v1/compliance/rules", json=new_rule)
    assert dup_res.status_code == 409

    # 4. Invalid Regex syntax check
    bad_rule = {
        "rule_id": "pii-invalid-regex",
        "name": "잘못된 정규식",
        "entity_type": "CUSTOM",
        "regex_pattern": "[A-Z++(",  # Unclosed parenthesis
        "confidence_threshold": 0.8,
        "action": "MASK"
    }
    bad_res = client.post("/api/v1/compliance/rules", json=bad_rule)
    assert bad_res.status_code == 400

    # 5. Update rule
    update_res = client.put("/api/v1/compliance/rules/pii-passport-test", json={
        "name": "여권번호 마스킹 (개정)",
        "confidence_threshold": 0.98,
        "action": "HASH"
    })
    assert update_res.status_code == 200
    updated = update_res.json()
    assert updated["name"] == "여권번호 마스킹 (개정)"
    assert updated["action"] == "HASH"

    # 6. Delete rule
    del_res = client.delete("/api/v1/compliance/rules/pii-passport-test")
    assert del_res.status_code == 200

    # 7. Verify deletion
    verify_res = client.delete("/api/v1/compliance/rules/pii-passport-test")
    assert verify_res.status_code == 404


# =====================================================================
# 3. PII Simulation & WORM Audit Log Generation Tests
# =====================================================================

def test_compliance_simulate_and_audit_log():
    sim_payload = {
        "text": "고객 홍길동님의 주민번호는 880520-1098765 이며 카드번호 1234-5678-9012-3456 로 결제 요청합니다.",
        "requester_id": "WM-9901",
        "key_id": "sk-ord-wm-prod-01",
        "model_id": "meta-llama/Llama-3.1-8B-Instruct"
    }

    res = client.post("/api/v1/compliance/simulate", json=sim_payload)
    assert res.status_code == 200
    data = res.json()

    # Verify masking
    assert not data["is_blocked"]
    assert "[MASKED_RRN]" in data["masked_text"]
    assert "[MASKED_CREDIT_CARD]" in data["masked_text"]
    assert "880520-1098765" not in data["masked_text"]
    assert "1234-5678-9012-3456" not in data["masked_text"]
    assert data["pii_count"] >= 2
    assert data["audit_log_id"] is not None

    # Verify WORM audit log was created in DB
    audit_res = client.get("/api/v1/compliance/audit-logs?requester_id=WM-9901")
    assert audit_res.status_code == 200
    logs = audit_res.json()
    assert len(logs) >= 1
    target_log = next(log for log in logs if log["log_id"] == data["audit_log_id"])
    assert target_log["requester_id"] == "WM-9901"
    assert target_log["action_taken"] == "MASK"
    assert target_log["is_blocked"] is False
    assert target_log["worm_reference_id"].startswith("worm-s3-vault://")
    assert target_log["original_prompt_hash"] == data["original_hash"]
    assert target_log["masked_payload_hash"] == data["masked_hash"]


def test_compliance_simulate_block():
    sim_payload = {
        "text": "비상 연락망: 담당 행번 EMP-AB12345 에게 문의 요망",
        "requester_id": "RISK-001",
        "key_id": "sk-ord-risk-dev-02"
    }

    res = client.post("/api/v1/compliance/simulate", json=sim_payload)
    assert res.status_code == 200
    data = res.json()

    assert data["is_blocked"] is True
    assert "[BLOCKED_BY_COMPLIANCE" in data["masked_text"]
    assert data["pii_count"] >= 1

    # Verify audit log recorded action_taken as BLOCK
    audit_res = client.get("/api/v1/compliance/audit-logs?action_taken=BLOCK")
    assert audit_res.status_code == 200
    logs = audit_res.json()
    assert any(l["log_id"] == data["audit_log_id"] for l in logs)


# =====================================================================
# 4. Compliance Stats API Tests
# =====================================================================

def test_compliance_stats():
    res = client.get("/api/v1/compliance/stats")
    assert res.status_code == 200
    stats = res.json()

    assert stats["total_rules"] >= 4
    assert stats["active_rules"] >= 4
    assert stats["total_audit_logs"] >= 2
    assert "RRN" in stats["detections_by_type"]
    assert "CREDIT_CARD" in stats["detections_by_type"]
