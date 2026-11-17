import logging
from app.db.base import Base
from app.db.session import engine, SessionLocal
from app.models.tenant import Tenant
from app.models.virtual_key import VirtualKey
from app.models.model_catalog import ModelCatalog
from app.models.routing_policy import RoutingPolicy
from app.models.pii_rule import PiiRule
from app.models.audit_log import AuditLog
from app.models.patch_history import PatchHistory
from app.models.agent_router_policy import AgentRouterPolicyModel
from app.models.system_prompt import SystemPrompt
from app.models.user import User, UserSession
from app.models.role import Role
from app.core.permissions import ALL_PERMISSION_CODES
from app.core.config import settings

logger = logging.getLogger(__name__)

def init_db():
    try:
        from sqlalchemy import text
        Base.metadata.create_all(bind=engine)

        # 0. Safe DDL Column Migrations (Execute before opening ORM session)
        try:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE virtual_keys ALTER COLUMN tenant_id DROP NOT NULL;"))
                conn.execute(text("ALTER TABLE model_catalogs ADD COLUMN IF NOT EXISTS serving_engine VARCHAR(32) DEFAULT 'vLLM';"))
                conn.execute(text("ALTER TABLE model_catalogs ADD COLUMN IF NOT EXISTS execution_method VARCHAR(32) DEFAULT 'k8s';"))
                conn.execute(text("ALTER TABLE model_catalogs ADD COLUMN IF NOT EXISTS api_key TEXT;"))
                conn.execute(text("ALTER TABLE model_catalogs ADD COLUMN IF NOT EXISTS auth_type VARCHAR(16) DEFAULT 'none';"))
                conn.execute(text("ALTER TABLE model_catalogs ADD COLUMN IF NOT EXISTS provider VARCHAR(32) DEFAULT 'openai';"))
                conn.execute(text("ALTER TABLE model_catalogs ADD COLUMN IF NOT EXISTS health_check_timeout NUMERIC(5, 2) DEFAULT 3.0;"))
                conn.execute(text("ALTER TABLE routing_policies ADD COLUMN IF NOT EXISTS priority INT DEFAULT 10;"))
                conn.execute(text("ALTER TABLE routing_policies ADD COLUMN IF NOT EXISTS match_conditions JSONB DEFAULT '{}'::jsonb;"))
                conn.execute(text("ALTER TABLE routing_policies ADD COLUMN IF NOT EXISTS failover_chain JSONB DEFAULT '[]'::jsonb;"))
                conn.execute(text("ALTER TABLE routing_policies ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;"))
                conn.execute(text("ALTER TABLE routing_policies ADD COLUMN IF NOT EXISTS description TEXT;"))
        except Exception as mig_err:
            logger.debug(f"Column migration check: {mig_err}")

        db = SessionLocal()

        # 1. Default System Roles Seed (Required for RBAC / Initial Admin Bootstrap)
        if db.query(Role).count() == 0:
            super_admin_role = Role(
                name="SUPER_ADMIN",
                display_name="전사 최고관리자",
                description="전사 플랫폼, 전 부서 테넌트, 모델 라우팅 및 보안 정책 총괄 최고 관리자",
                is_system=True,
                permissions=ALL_PERMISSION_CODES
            )
            tenant_admin_role = Role(
                name="TENANT_ADMIN",
                display_name="부서 관리자",
                description="소속 부서(테넌트) 한정 가상키 발급/파기, 시스템 프롬프트, FinOps 모니터링 관리자",
                is_system=True,
                permissions=[
                    "overview:read", "routing:read", "governance:read", "governance:write",
                    "prompts:read", "prompts:write", "finops:read", "prompt_studio:execute"
                ]
            )
            viewer_role = Role(
                name="VIEWER",
                display_name="일반 조회자",
                description="전사 또는 소속 부서 운영 지표 및 감사 로그 열람 전용 읽기 사용자",
                is_system=True,
                permissions=[
                    "overview:read", "routing:read", "governance:read",
                    "prompts:read", "finops:read", "compliance:read", "lifecycle:read"
                ]
            )
            db.add_all([super_admin_role, tenant_admin_role, viewer_role])
            db.commit()
            logger.info("Initialized database with default system roles (SUPER_ADMIN, TENANT_ADMIN, VIEWER)")

        # 1.1 Initial Super Admin Account Bootstrap (Ensures admin can log in after make up)
        from app.core.security import hash_password
        existing_admin = db.query(User).filter(User.username == settings.INITIAL_ADMIN_USERNAME).first()
        if not existing_admin and db.query(User).filter(User.role == "SUPER_ADMIN").count() == 0:
            if settings.INITIAL_ADMIN_PASSWORD:
                initial_admin = User(
                    username=settings.INITIAL_ADMIN_USERNAME,
                    full_name="시스템 최고관리자",
                    email=settings.INITIAL_ADMIN_EMAIL,
                    password_hash=hash_password(settings.INITIAL_ADMIN_PASSWORD),
                    role="SUPER_ADMIN",
                    tenant_id=None,
                    is_active=True,
                    failed_login_count=0,
                    locked_until=None
                )
                db.add(initial_admin)
                db.commit()
                logger.info(f"Bootstrapped initial SUPER_ADMIN account: '{settings.INITIAL_ADMIN_USERNAME}'")
        elif existing_admin and settings.ENV == "development":
            # In local development mode (make down && make up), recover locked initial admin account automatically
            if existing_admin.failed_login_count > 0 or existing_admin.locked_until is not None or not existing_admin.is_active:
                existing_admin.failed_login_count = 0
                existing_admin.locked_until = None
                existing_admin.is_active = True
                db.commit()
                logger.info(f"Cleared login lockout for initial admin '{existing_admin.username}' on development startup")

        # 2. System Diagnostics Key Provisioning (Internal gateway diagnostics only)
        from app.core.security import ensure_system_diagnostics_key
        ensure_system_diagnostics_key(db)
        logger.info("Initialized database with official system diagnostics virtual key")

        # 3. AgentRouter 4-Tier Strategy Slots
        if db.query(AgentRouterPolicyModel).count() == 0:
            import copy
            from app.core.agent_router.policy_manager import DEFAULT_POLICIES_CONFIG
            for p_data in DEFAULT_POLICIES_CONFIG:
                cfg = copy.deepcopy(p_data["config"])
                if not settings.SEED_DEMO_DATA:
                    # Leave model bindings empty until user registers models via Web UI
                    for k in ("reasoning_model", "fast_model", "economic_model", "standard_model", "primary_fast_model", "primary_fallback_model", "secondary_fallback_model"):
                        if k in cfg:
                            cfg[k] = ""
                row = AgentRouterPolicyModel(
                    policy_id=p_data["policy_id"],
                    name=p_data["name"],
                    description=p_data["description"],
                    is_active=p_data["is_active"],
                    config=cfg
                )
                db.add(row)
            db.commit()
            logger.info("Initialized database with AgentRouter 4-tier policy slots")

        # 4. Demo / Sample Data Seeding (ONLY when explicitly enabled via SEED_DEMO_DATA=True)
        if not settings.SEED_DEMO_DATA:
            db.close()
            return

        # Demo Tenants
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
                backend_infra="On-Prem K8s",
                serving_engine="vLLM",
                execution_method="k8s",
                target_endpoint="http://vllm-llama8b.ai-serving:8000",
                input_price_per_1k=0.8000,
                output_price_per_1k=2.4000,
                cache_discount_ratio=0.2500,
                is_active=True,
                auth_type="none"
            )
            m2 = ModelCatalog(
                model_id="meta-llama/Llama-3.1-8B-FineTuned-v2",
                alias="financial-advisor-canary",
                backend_infra="On-Prem K8s",
                serving_engine="vLLM",
                execution_method="k8s",
                target_endpoint="http://vllm-llama8b-canary.ai-serving:8000",
                input_price_per_1k=0.8000,
                output_price_per_1k=2.4000,
                cache_discount_ratio=0.2500,
                is_active=True,
                auth_type="none"
            )
            m3 = ModelCatalog(
                model_id="meta-llama/Llama-3.1-70B-Instruct",
                alias="deep-risk-evaluator",
                backend_infra="Bare-Metal GPU",
                serving_engine="vLLM",
                execution_method="direct",
                target_endpoint="http://10.20.4.12:8000",
                input_price_per_1k=3.5000,
                output_price_per_1k=10.5000,
                cache_discount_ratio=0.2500,
                is_active=True,
                auth_type="none"
            )
            m4 = ModelCatalog(
                model_id="Solar-10.7B-Financial",
                alias="compliance-auditor",
                backend_infra="Private VM",
                serving_engine="vLLM",
                execution_method="docker-compose",
                target_endpoint="http://vllm-solar.ai-serving:8000",
                input_price_per_1k=1.2000,
                output_price_per_1k=3.6000,
                cache_discount_ratio=0.2500,
                is_active=True,
                auth_type="none"
            )
            m5 = ModelCatalog(
                model_id="qwen2.5:14b",
                alias="ollama-local-advisor",
                backend_infra="Local Server",
                serving_engine="Ollama",
                execution_method="direct",
                target_endpoint="http://127.0.0.1:11434",
                input_price_per_1k=0.5000,
                output_price_per_1k=1.5000,
                cache_discount_ratio=0.2500,
                is_active=True,
                auth_type="none"
            )
            db.add_all([m1, m2, m3, m4, m5])
            db.commit()
            logger.info("Initialized database with default model catalog")

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
                key_id="sk-ord-wm-prod-01",
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
                key_id="sk-ord-risk-dev-02",
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

        # 6. Baseline Patch History
        if db.query(PatchHistory).count() == 0:
            p1 = PatchHistory(
                patch_id="patch-v1.2.0-baseline",
                package_name="ordinatio-core-v1.2.0-initial.tar.gz",
                target_component="all",
                previous_version="v1.1.9",
                applied_version="v1.2.0",
                signature_verified=True,
                status="APPLIED",
                applied_by="system-installer",
                details_json='{"release_notes": "초기 고객사 폐쇄망 표준 릴리즈 배포", "signer": "Antigravity Vendor Official Release Key (RSA-4096)"}'
            )
            db.add(p1)
            db.commit()
            logger.info("Initialized database with baseline patch history")

        # 7. AgentRouter 4-Tier Routing Policies
        if db.query(AgentRouterPolicyModel).count() == 0:
            from app.core.agent_router.policy_manager import DEFAULT_POLICIES_CONFIG
            for p_data in DEFAULT_POLICIES_CONFIG:
                row = AgentRouterPolicyModel(
                    policy_id=p_data["policy_id"],
                    name=p_data["name"],
                    description=p_data["description"],
                    is_active=p_data["is_active"],
                    config=p_data["config"]
                )
                db.add(row)
            db.commit()
            logger.info("Initialized database with default AgentRouter 4-tier policies")

        # 8. System Diagnostics Key Provisioning
        from app.core.security import ensure_system_diagnostics_key
        ensure_system_diagnostics_key(db)
        logger.info("Initialized database with official system diagnostics virtual key")

        # 9. Default System Prompts Seed (Phase 1)
        if db.query(SystemPrompt).count() == 0:
            sp1 = SystemPrompt(
                prompt_id="sp-global-guardrail",
                name="전사 공통 금융 보안 및 컴플라이언스 가드레일",
                description="모든 LLM 추론에 적용되는 기본 개인정보 보호 및 사내 기밀 반출 방지 지침",
                content="[사내 보안 및 금융 컴플라이언스 기본 지침]\n1. 금융거래정보, 주민등록번호, 계좌 비밀번호 등 개인 식별 정보를 절대 외부로 유출하거나 요구하지 마십시오.\n2. 사내 규정과 금융소비자보호법을 철저히 준수하며 객관적이고 신뢰할 수 있는 정보를 제공하십시오.\n3. 불확실한 투자 조언이나 확정적 수익률 보장은 엄격히 금지됩니다.",
                target_type="GLOBAL",
                target_id=None,
                target_name="전사 공통 (Global)",
                injection_mode="PREPEND",
                estimated_tokens=75,
                is_active=True
            )
            sp2 = SystemPrompt(
                prompt_id="sp-wm-advisor",
                name="자산관리(WM)혁신부 고객 상담 표준 페르소나",
                description="자산관리부 소속 가상키 및 라우트 호출 시 적용되는 전문 PB 상담 페르소나",
                content="[자산관리(WM) 고객 상담 표준 페르소나]\n- 귀하는 최고 수준의 금융 전문 프라이빗 뱅커(PB) 어시스턴트입니다.\n- 고객의 자산 포트폴리오를 다각도로 분석하고, 위험 성향에 맞춘 최적의 자산 배분 방안을 정중하고 격조 높은 어조로 제안하십시오.\n- 답변 시 항상 고객의 투자 리스크 관리 방안을 함께 안내해야 합니다.",
                target_type="TENANT",
                target_id="dept-wm",
                target_name="자산관리부 (WM-01)",
                injection_mode="PREPEND",
                estimated_tokens=70,
                is_active=True
            )
            sp3 = SystemPrompt(
                prompt_id="sp-route-code",
                name="사내 개발팀 코드 생성 및 SQL 최적화 가이드",
                description="code-copilot-v2 라우트 전용 시큐어 코딩 및 성능 가이드라인",
                content="[사내 개발 표준 시큐어 코딩 지침]\n- 생성되는 모든 코드는 SQL Injection, XSS, 하드코딩된 Secret이 없는지 엄격히 점검하십시오.\n- PEP8 및 표준 린트 규칙을 준수하고, 시간 복잡도와 메모리 효율성을 고려한 최적화 코드를 작성하십시오.\n- 가능한 한 단위 테스트 코드(Unit Test)를 함께 작성하여 신뢰성을 확보하십시오.",
                target_type="ROUTE",
                target_id="code-copilot-v2",
                target_name="code-copilot-v2 라우트",
                injection_mode="PREPEND",
                estimated_tokens=65,
                is_active=True
            )
            db.add_all([sp1, sp2, sp3])
            db.commit()
            logger.info("Initialized database with default system prompts catalog")

        # 10. Default System Roles Seed (Phase 6 Dynamic RBAC)
        if db.query(Role).count() == 0:
            super_admin_role = Role(
                name="SUPER_ADMIN",
                display_name="전사 최고관리자",
                description="전사 플랫폼, 전 부서 테넌트, 모델 라우팅 및 보안 정책 총괄 최고 관리자",
                is_system=True,
                permissions=ALL_PERMISSION_CODES
            )
            tenant_admin_role = Role(
                name="TENANT_ADMIN",
                display_name="부서 관리자",
                description="소속 부서(테넌트) 한정 가상키 발급/파기, 시스템 프롬프트, FinOps 모니터링 관리자",
                is_system=True,
                permissions=[
                    "overview:read", "routing:read", "governance:read", "governance:write",
                    "prompts:read", "prompts:write", "finops:read", "prompt_studio:execute"
                ]
            )
            viewer_role = Role(
                name="VIEWER",
                display_name="일반 조회자",
                description="전사 또는 소속 부서 운영 지표 및 감사 로그 열람 전용 읽기 사용자",
                is_system=True,
                permissions=[
                    "overview:read", "routing:read", "governance:read",
                    "prompts:read", "finops:read", "compliance:read", "lifecycle:read"
                ]
            )
            db.add_all([super_admin_role, tenant_admin_role, viewer_role])
            db.commit()
            logger.info("Initialized database with default system roles (SUPER_ADMIN, TENANT_ADMIN, VIEWER)")

        db.close()
    except Exception as e:
        logger.warning(f"Database initialization skipped or deferred: {e}")

