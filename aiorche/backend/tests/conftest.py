import pytest
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.base import Base
from app.db.session import get_db
from app.models.tenant import Tenant
from app.models.virtual_key import VirtualKey

TEST_DATABASE_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

def override_get_db():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

from app.models.model_catalog import ModelCatalog
from app.models.routing_policy import RoutingPolicy
from app.models.pii_rule import PiiRule
from app.models.audit_log import AuditLog

# Create all tables and seed data immediately at module load
Base.metadata.create_all(bind=test_engine)

def seed_data():
    db = TestSessionLocal()
    if not db.query(Tenant).filter(Tenant.tenant_id == "dept-wm").first():
        db.add(Tenant(
            tenant_id="dept-wm",
            name="자산관리(WM)혁신부",
            department_code="WM-01",
            monthly_budget_krw=Decimal("15000000.00"),
            spent_budget_krw=Decimal("0.00"),
            is_hard_cap_enabled=True
        ))
    if not db.query(Tenant).filter(Tenant.tenant_id == "dept-ai-lab").first():
        db.add(Tenant(
            tenant_id="dept-ai-lab",
            name="AI융합기술연구소",
            department_code="AILAB-01",
            monthly_budget_krw=Decimal("10000000.00"),
            spent_budget_krw=Decimal("0.00"),
            is_hard_cap_enabled=True
        ))
    
    # Seed Models if missing
    if not db.query(ModelCatalog).filter(ModelCatalog.model_id == "meta-llama/Llama-3.1-8B-Instruct").first():
        db.add_all([
            ModelCatalog(
                model_id="meta-llama/Llama-3.1-8B-Instruct",
                alias="financial-advisor-v1",
                backend_infra="EKS",
                target_endpoint="http://vllm-llama8b.ai-serving:8000",
                input_price_per_1k=0.8000,
                output_price_per_1k=2.4000,
                cache_discount_ratio=0.2500,
                is_active=True
            ),
            ModelCatalog(
                model_id="meta-llama/Llama-3.1-8B-FineTuned-v2",
                alias="financial-advisor-canary",
                backend_infra="EKS",
                target_endpoint="http://vllm-llama8b-canary.ai-serving:8000",
                input_price_per_1k=0.8000,
                output_price_per_1k=2.4000,
                cache_discount_ratio=0.2500,
                is_active=True
            ),
            ModelCatalog(
                model_id="meta-llama/Llama-3.1-70B-Instruct",
                alias="deep-risk-evaluator",
                backend_infra="EC2",
                target_endpoint="http://10.20.4.12:8000",
                input_price_per_1k=3.5000,
                output_price_per_1k=10.5000,
                cache_discount_ratio=0.2500,
                is_active=True
            )
        ])
    
    # Seed Routing Policy if missing
    if not db.query(RoutingPolicy).filter(RoutingPolicy.route_name == "financial-advisor-v1").first():
        db.add(RoutingPolicy(
            policy_id="pol-default",
            route_name="financial-advisor-v1",
            traffic_weights=[
                {"model_id": "meta-llama/Llama-3.1-8B-Instruct", "weight": 80},
                {"model_id": "meta-llama/Llama-3.1-8B-FineTuned-v2", "weight": 20}
            ],
            load_balancing_strategy="LeastQueueDepth",
            failover_model_id="meta-llama/Llama-3.1-70B-Instruct",
            xds_revision="xds-rev-20260911-1422",
            deployed_by="admin"
        ))

    # Seed PiiRule if missing
    if not db.query(PiiRule).filter(PiiRule.rule_id == "pii-rrn").first():
        db.add_all([
            PiiRule(
                rule_id="pii-rrn",
                name="주민등록번호 마스킹",
                entity_type="RRN",
                regex_pattern=r"\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])-[1-4]\d{6}",
                confidence_threshold=0.99,
                action="MASK",
                is_active=True,
            ),
            PiiRule(
                rule_id="pii-account",
                name="계좌번호 가명화(해싱)",
                entity_type="BANK_ACCOUNT",
                regex_pattern=r"\b\d{3,6}-\d{2,6}-\d{3,6}\b",
                confidence_threshold=0.90,
                action="HASH",
                is_active=True,
            ),
            PiiRule(
                rule_id="pii-card",
                name="신용카드 번호 마스킹",
                entity_type="CREDIT_CARD",
                regex_pattern=r"\b\d{4}-\d{4}-\d{4}-\d{4}\b",
                confidence_threshold=0.95,
                action="MASK",
                is_active=True,
            ),
            PiiRule(
                rule_id="pii-employee",
                name="사내 행번/사번 차단",
                entity_type="EMPLOYEE_ID",
                regex_pattern=r"\bEMP-[A-Z]{2}\d{5}\b",
                confidence_threshold=0.85,
                action="BLOCK",
                is_active=True,
            ),
        ])

    # Seed AuditLog if empty
    if db.query(AuditLog).count() == 0:
        import json
        db.add_all([
            AuditLog(
                log_id="aud-test-001",
                requester_id="WM-10042",
                key_id="sk-orch-wm-prod-01",
                model_id="meta-llama/Llama-3.1-8B-Instruct",
                original_prompt_hash="sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                masked_payload_hash="sha256:88d4266fd4e6338d13b845fcf289579d209c897823b9217da3e161936f031589",
                detections_json=json.dumps([
                    {"entity_type": "RRN", "rule_id": "pii-rrn", "rule_name": "주민등록번호 마스킹", "confidence": 0.99, "action": "MASK", "replacement": "[MASKED_RRN]"}
                ]),
                pii_count=1,
                action_taken="MASK",
                latency_ms=1.420,
                is_blocked=False,
                worm_reference_id="worm-s3-vault://audit/aud-test-001.json"
            ),
            AuditLog(
                log_id="aud-test-002",
                requester_id="EMP-HQ99120",
                key_id="sk-orch-risk-dev-02",
                model_id="Solar-10.7B-Financial",
                original_prompt_hash="sha256:ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
                masked_payload_hash="sha256:ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
                detections_json=json.dumps([
                    {"entity_type": "EMPLOYEE_ID", "rule_id": "pii-employee", "rule_name": "사내 행번/사번 차단", "confidence": 0.85, "action": "BLOCK", "replacement": "[BLOCKED]"}
                ]),
                pii_count=1,
                action_taken="BLOCK",
                latency_ms=0.890,
                is_blocked=True,
                worm_reference_id="worm-s3-vault://audit/aud-test-002.json"
            )
        ])

    db.commit()
    db.close()

seed_data()

@pytest.fixture(autouse=True)
def ensure_db_seeded():
    seed_data()
    yield
