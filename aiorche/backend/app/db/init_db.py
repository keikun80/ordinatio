import logging
from app.db.base import Base
from app.db.session import engine, SessionLocal
from app.models.tenant import Tenant
from app.models.virtual_key import VirtualKey
from app.models.model_catalog import ModelCatalog
from app.models.routing_policy import RoutingPolicy
from app.models.pii_rule import PiiRule
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)

def init_db():
    try:
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        
        # 1. Tenants
        if db.query(Tenant).count() == 0:
            wm = Tenant(
                tenant_id="dept-wm",
                name="자산관리부",
                department_code="WM-01",
                monthly_budget_krw=15000000.00,
                spent_budget_krw=2840000.00,
                is_hard_cap_enabled=True,
            )
            ai_lab = Tenant(
                tenant_id="dept-ai-lab",
                name="AI 혁신 랩",
                department_code="AILAB-01",
                monthly_budget_krw=30000000.00,
                spent_budget_krw=5420000.00,
                is_hard_cap_enabled=False,
            )
            db.add_all([wm, ai_lab])
            db.commit()
            logger.info("Initialized database with default tenants")

        # 2. Serving Model Catalog
        if db.query(ModelCatalog).count() == 0:
            m1 = ModelCatalog(
                model_id="meta-llama/Llama-3.1-8B-Instruct",
                alias="financial-advisor-v1",
                backend_infra="EKS",
                target_endpoint="http://vllm-llama8b.ai-serving:8000",
                input_price_per_1k=0.8000,
                output_price_per_1k=2.4000,
                cache_discount_ratio=0.2500,
                is_active=True
            )
            m2 = ModelCatalog(
                model_id="meta-llama/Llama-3.1-8B-FineTuned-v2",
                alias="financial-advisor-canary",
                backend_infra="EKS",
                target_endpoint="http://vllm-llama8b-canary.ai-serving:8000",
                input_price_per_1k=0.8000,
                output_price_per_1k=2.4000,
                cache_discount_ratio=0.2500,
                is_active=True
            )
            m3 = ModelCatalog(
                model_id="meta-llama/Llama-3.1-70B-Instruct",
                alias="deep-risk-evaluator",
                backend_infra="EC2",
                target_endpoint="http://10.20.4.12:8000",
                input_price_per_1k=3.5000,
                output_price_per_1k=10.5000,
                cache_discount_ratio=0.2500,
                is_active=True
            )
            m4 = ModelCatalog(
                model_id="Solar-10.7B-Financial",
                alias="compliance-auditor",
                backend_infra="ECS",
                target_endpoint="http://vllm-solar.ai-serving:8000",
                input_price_per_1k=1.2000,
                output_price_per_1k=3.6000,
                cache_discount_ratio=0.2500,
                is_active=True
            )
            db.add_all([m1, m2, m3, m4])
            db.commit()
            logger.info("Initialized database with default model catalog")

        # Migration: Ensure columns exist on existing table
        try:
            from sqlalchemy import text
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE routing_policies ADD COLUMN IF NOT EXISTS priority INT DEFAULT 10;"))
                conn.execute(text("ALTER TABLE routing_policies ADD COLUMN IF NOT EXISTS match_conditions JSONB DEFAULT '{}'::jsonb;"))
                conn.execute(text("ALTER TABLE routing_policies ADD COLUMN IF NOT EXISTS failover_chain JSONB DEFAULT '[]'::jsonb;"))
                conn.execute(text("ALTER TABLE routing_policies ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;"))
                conn.execute(text("ALTER TABLE routing_policies ADD COLUMN IF NOT EXISTS description TEXT;"))
                conn.commit()
        except Exception as mig_err:
            logger.debug(f"Column migration check: {mig_err}")

        # 3. Dynamic Routing Policy (Multi-Routing Seeds)
        if db.query(RoutingPolicy).count() == 0:
            p1 = RoutingPolicy(
                policy_id="pol-default",
                route_name="financial-advisor-v1",
                traffic_weights=[
                    {"model_id": "meta-llama/Llama-3.1-8B-Instruct", "weight": 70},
                    {"model_id": "meta-llama/Llama-3.1-8B-FineTuned-v2", "weight": 20},
                    {"model_id": "Solar-10.7B-Financial", "weight": 10}
                ],
                load_balancing_strategy="LeastQueueDepth",
                failover_model_id="meta-llama/Llama-3.1-70B-Instruct",
                xds_revision="xds-rev-20260911-1422",
                deployed_by="admin",
                priority=10,
                match_conditions={"tenant_codes": ["WM-01"], "path_prefix": "/v1/routes/financial-advisor"},
                failover_chain=["meta-llama/Llama-3.1-70B-Instruct", "Solar-10.7B-Financial"],
                is_active=True,
                description="자산관리(WM) 및 PB 고객 전용 3-way 카나리 라우팅 풀"
            )
            p2 = RoutingPolicy(
                policy_id="pol-cs-v1",
                route_name="customer-service-v1",
                traffic_weights=[
                    {"model_id": "meta-llama/Llama-3.1-8B-Instruct", "weight": 80},
                    {"model_id": "Solar-10.7B-Financial", "weight": 20}
                ],
                load_balancing_strategy="RoundRobin",
                failover_model_id="meta-llama/Llama-3.1-70B-Instruct",
                xds_revision="xds-rev-20260911-1422",
                deployed_by="admin",
                priority=20,
                match_conditions={"path_prefix": "/v1/routes/customer-service"},
                failover_chain=["meta-llama/Llama-3.1-70B-Instruct"],
                is_active=True,
                description="고객센터 챗봇 및 FAQ 실시간 상담 라우트"
            )
            p3 = RoutingPolicy(
                policy_id="pol-code-v2",
                route_name="code-copilot-v2",
                traffic_weights=[
                    {"model_id": "meta-llama/Llama-3.1-70B-Instruct", "weight": 100}
                ],
                load_balancing_strategy="PrefixCacheAffinity",
                failover_model_id="meta-llama/Llama-3.1-8B-Instruct",
                xds_revision="xds-rev-20260911-1422",
                deployed_by="admin",
                priority=30,
                match_conditions={"headers": {"x-route-tag": "coding"}, "path_prefix": "/v1/routes/code-copilot"},
                failover_chain=["meta-llama/Llama-3.1-8B-Instruct"],
                is_active=True,
                description="사내 개발팀 코드 생성 및 SQL 최적화 전용 라우트"
            )
            db.add_all([p1, p2, p3])
            db.commit()
            logger.info("Initialized database with default multi-routing policies")

        # 4. PII Rules (Phase 4 Compliance)
        if db.query(PiiRule).count() == 0:
            r1 = PiiRule(
                rule_id="pii-rrn",
                name="주민등록번호 마스킹",
                entity_type="RRN",
                regex_pattern=r"\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])-[1-4]\d{6}",
                confidence_threshold=0.99,
                action="MASK",
                is_active=True,
            )
            r2 = PiiRule(
                rule_id="pii-account",
                name="계좌번호 가명화(해싱)",
                entity_type="BANK_ACCOUNT",
                regex_pattern=r"\b\d{3,6}-\d{2,6}-\d{3,6}\b",
                confidence_threshold=0.90,
                action="HASH",
                is_active=True,
            )
            r3 = PiiRule(
                rule_id="pii-card",
                name="신용카드 번호 마스킹",
                entity_type="CREDIT_CARD",
                regex_pattern=r"\b\d{4}-\d{4}-\d{4}-\d{4}\b",
                confidence_threshold=0.95,
                action="MASK",
                is_active=True,
            )
            r4 = PiiRule(
                rule_id="pii-employee",
                name="사내 행번/사번 차단",
                entity_type="EMPLOYEE_ID",
                regex_pattern=r"\bEMP-[A-Z]{2}\d{5}\b",
                confidence_threshold=0.85,
                action="BLOCK",
                is_active=True,
            )
            db.add_all([r1, r2, r3, r4])
            db.commit()
            logger.info("Initialized database with default PII rules")

        # 5. Seed Audit Logs if empty
        if db.query(AuditLog).count() == 0:
            import json
            a1 = AuditLog(
                log_id="aud-init-001",
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
                worm_reference_id="worm-s3-vault://audit/aud-init-001.json"
            )
            a2 = AuditLog(
                log_id="aud-init-002",
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
                worm_reference_id="worm-s3-vault://audit/aud-init-002.json"
            )
            db.add_all([a1, a2])
            db.commit()
            logger.info("Initialized database with sample audit logs")

        db.close()
    except Exception as e:
        logger.warning(f"Database initialization skipped or deferred: {e}")
