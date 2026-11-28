import sys
import pytest
from decimal import Decimal
from datetime import datetime, timezone, timedelta

# Guarantee singleton conftest module across both 'conftest' and 'tests.conftest'
if __name__ in sys.modules:
    sys.modules["tests.conftest"] = sys.modules[__name__]
    sys.modules["conftest"] = sys.modules[__name__]
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.base import Base
from app.db.session import get_db
from app.models.tenant import Tenant
from app.models.virtual_key import VirtualKey
from app.core.security import hash_password, create_access_token

from app.core.config import settings
settings.ALLOW_DEV_MOCK_KEYS = True

# WORM 감사 저장소를 테스트 전용 임시 디렉터리로 격리한다.
# 격리하지 않으면 테스트가 개발 저장소(backend/data/worm_audit)에 레코드를 영구 적재하고,
# 누적된 과거 레코드의 상태가 무결성 검증 테스트 결과를 좌우해 재현성이 사라진다.
import atexit
import shutil
import tempfile

_WORM_TEST_DIR = tempfile.mkdtemp(prefix="ordinatio-worm-test-")
settings.WORM_STORAGE_PATH = _WORM_TEST_DIR
atexit.register(lambda: shutil.rmtree(_WORM_TEST_DIR, ignore_errors=True))

TEST_DATABASE_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

from app.db import session as db_session
db_session.SessionLocal = TestSessionLocal
db_session.engine = test_engine

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
from app.models.patch_history import PatchHistory
from app.models.system_prompt import SystemPrompt
from app.models.system_prompt_version import SystemPromptVersion
from app.models.daily_token_ledger import DailyTokenLedger
from app.models.user import User, UserSession
from app.models.role import Role
from app.core.permissions import ALL_PERMISSION_CODES

# Create all tables and seed data immediately at module load
Base.metadata.create_all(bind=test_engine)

def get_test_super_admin_token() -> str:
    db = TestSessionLocal()
    try:
        admin = db.query(User).filter(User.username == "test-super-admin").first()
        now = datetime.now(timezone.utc)
        if not admin:
            admin = User(
                id="usr-test-super-admin",
                username="test-super-admin",
                full_name="테스트 최고관리자",
                email="test-admin@ordinatio.local",
                password_hash=hash_password("SuperAdmin123!"),
                role="SUPER_ADMIN",
                is_active=True
            )
            db.add(admin)
            db.commit()

        session_id = "sess-test-super-admin"
        sess = db.query(UserSession).filter(UserSession.id == session_id).first()
        if not sess:
            sess = UserSession(
                id=session_id,
                user_id=admin.id,
                session_token_hash="hash-test-super-admin",
                ip_address="127.0.0.1",
                user_agent="pytest",
                last_activity_at=now,
                expires_at=now + timedelta(hours=24),
                is_revoked=False
            )
            db.add(sess)
            db.commit()
        else:
            sess.is_revoked = False
            sess.last_activity_at = now
            sess.expires_at = now + timedelta(hours=24)
            db.commit()

        return create_access_token(
            user_id=admin.id,
            username=admin.username,
            role=admin.role,
            tenant_id=admin.tenant_id,
            session_id=session_id,
            expires_delta=timedelta(hours=24)
        )
    finally:
        db.close()

_orig_testclient_init = TestClient.__init__

def _patched_testclient_init(self, *args, **kwargs):
    _orig_testclient_init(self, *args, **kwargs)
    try:
        token = get_test_super_admin_token()
        if token:
            self.headers.setdefault("Authorization", f"Bearer {token}")
    except Exception:
        pass

TestClient.__init__ = _patched_testclient_init

_orig_testclient_request = TestClient.request

def _patched_testclient_request(self, method, url, *args, **kwargs):
    # Ensure super admin session is always intact in DB for authenticated test calls
    db = TestSessionLocal()
    try:
        sess = db.query(UserSession).filter(UserSession.id == "sess-test-super-admin").first()
        if not sess:
            get_test_super_admin_token()
    except Exception:
        pass
    finally:
        db.close()
    return _orig_testclient_request(self, method, url, *args, **kwargs)

TestClient.request = _patched_testclient_request

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture
def db_session():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


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
                backend_infra="On-Prem K8s",
                serving_engine="vLLM",
                execution_method="k8s",
                target_endpoint="http://vllm-llama8b.ai-serving:8000",
                input_price_per_1k=0.8000,
                output_price_per_1k=2.4000,
                cache_discount_ratio=0.2500,
                is_active=True,
                auth_type="none"
            ),
            ModelCatalog(
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
            ),
            ModelCatalog(
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
            ),
            ModelCatalog(
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

    # 시스템 프롬프트 시드(sp-route-code)가 바인딩하는 라우트를 운영 시드(init_db.py)와 동일하게 보강.
    # 바인딩 타겟 존재 검증이 항상 수행되므로 픽스처가 자체 정합성을 가져야 한다.
    if not db.query(RoutingPolicy).filter(RoutingPolicy.route_name == "code-copilot-v2").first():
        db.add(RoutingPolicy(
            policy_id="pol-code-copilot",
            route_name="code-copilot-v2",
            traffic_weights=[
                {"model_id": "meta-llama/Llama-3.1-70B-Instruct", "weight": 100}
            ],
            load_balancing_strategy="RoundRobin",
            failover_model_id="meta-llama/Llama-3.1-8B-Instruct",
            xds_revision="xds-rev-20260911-1423",
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
                worm_reference_id="worm-s3-vault://audit/aud-test-001.json"
            ),
            AuditLog(
                log_id="aud-test-002",
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
                worm_reference_id="worm-s3-vault://audit/aud-test-002.json"
            )
        ])

    from app.core.security import ensure_system_diagnostics_key
    ensure_system_diagnostics_key(db)

    # Seed PiiPreset if empty
    from app.models.pii_preset import PiiPreset
    if db.query(PiiPreset).count() == 0:
        db.add_all([
            PiiPreset(
                preset_id="preset-rrn-sample",
                label="주민등록번호 포함 대출 심사 요청",
                text="홍길동 고객님의 신용대출 승인을 요청합니다. 주민등록번호는 880101-1234567 이며, 서울시 영등포구 여의도동 거주 중입니다.",
                created_by="system"
            ),
            PiiPreset(
                preset_id="preset-bank-sample",
                label="계좌번호 및 급여 이체 문의",
                text="국민은행 123-456-789012 계좌로 이번 달 급여 4,500,000원을 이체 요청드립니다. 예금주: 김철수",
                created_by="system"
            ),
            PiiPreset(
                preset_id="preset-card-sample",
                label="신용카드 번호 결제 승인 요청",
                text="기업카드 9410-1234-5678-9012 로 서버 인프라 비용 $1,250 결제 진행해 주세요.",
                created_by="system"
            ),
            PiiPreset(
                preset_id="preset-emp-sample",
                label="사번 포함 개발팀 계정 권한 신청 (BLOCK 대상)",
                text="개발1팀 사번 EMP-2024-0012 직원의 프로덕션 DB 읽기 권한 상향을 요청합니다.",
                created_by="system"
            )
        ])

    # Seed System Prompts if empty
    if not db.query(SystemPrompt).filter(SystemPrompt.prompt_id == "sp-global-guardrail").first():
        db.add_all([
            SystemPrompt(
                prompt_id="sp-global-guardrail",
                name="전사 공통 금융 보안 및 컴플라이언스 가드레일",
                description="모든 LLM 추론에 적용되는 기본 개인정보 보호 및 사내 기밀 반출 방지 지침",
                content="[사내 보안 및 금융 컴플라이언스 기본 지침]\n1. 금융거래정보, 주민등록번호, 계좌 비밀번호 등 개인 식별 정보를 절대 외부로 유출하거나 요구하지 마십시오.\n2. 사내 규정과 금융소비자보호법을 철저히 준수하며 객관적이고 신뢰할 수 있는 정보를 제공하십시오.\n3. 불확실한 투자 조언이나 확정적 수익률 보장은 엄격히 금지됩니다.",
                target_type="GLOBAL",
                target_id=None,
                target_name="전사 공통 (Global)",
                injection_mode="PREPEND",
                estimated_tokens=216,
                is_active=True
            ),
            SystemPrompt(
                prompt_id="sp-wm-advisor",
                name="자산관리(WM)혁신부 고객 상담 표준 페르소나",
                description="자산관리부 소속 가상키 및 라우트 호출 시 적용되는 전문 PB 상담 페르소나",
                content="[자산관리(WM) 고객 상담 표준 페르소나]\n- 귀하는 최고 수준의 금융 전문 프라이빗 뱅커(PB) 어시스턴트입니다.\n- 고객의 자산 포트폴리오를 다각도로 분석하고, 위험 성향에 맞춘 최적의 자산 배분 방안을 정중하고 격조 높은 어조로 제안하십시오.\n- 답변 시 항상 고객의 투자 리스크 관리 방안을 함께 안내해야 합니다.",
                target_type="TENANT",
                target_id="dept-wm",
                target_name="자산관리부 (WM-01)",
                injection_mode="PREPEND",
                estimated_tokens=204,
                is_active=True
            ),
            SystemPrompt(
                prompt_id="sp-route-code",
                name="사내 개발팀 코드 생성 및 SQL 최적화 가이드",
                description="code-copilot-v2 라우트 전용 시큐어 코딩 및 성능 가이드라인",
                content="[사내 개발 표준 시큐어 코딩 지침]\n- 생성되는 모든 코드는 SQL Injection, XSS, 하드코딩된 Secret이 없는지 엄격히 점검하십시오.\n- PEP8 및 표준 린트 규칙을 준수하고, 시간 복잡도와 메모리 효율성을 고려한 최적화 코드를 작성하십시오.\n- 가능한 한 단위 테스트 코드(Unit Test)를 함께 작성하여 신뢰성을 확보하십시오.",
                target_type="ROUTE",
                target_id="code-copilot-v2",
                target_name="code-copilot-v2 라우트",
                injection_mode="PREPEND",
                estimated_tokens=192,
                is_active=True
            )
        ])

    # Seed Default Roles if empty
    if not db.query(Role).filter(Role.name == "SUPER_ADMIN").first():
        db.add_all([
            Role(
                name="SUPER_ADMIN",
                display_name="전사 최고관리자",
                description="전사 플랫폼, 전 부서 테넌트, 모델 라우팅 및 보안 정책 총괄 최고 관리자",
                is_system=True,
                permissions=["*"] + ALL_PERMISSION_CODES
            ),
            Role(
                name="TENANT_ADMIN",
                display_name="부서 관리자",
                description="소속 부서(테넌트) 한정 가상키 발급/파기, 시스템 프롬프트, FinOps 모니터링 관리자",
                is_system=True,
                permissions=[
                    "overview:read", "routing:read", "governance:read", "governance:write",
                    "prompts:read", "prompts:write", "finops:read", "prompt_studio:execute"
                ]
            ),
            Role(
                name="VIEWER",
                display_name="일반 조회자",
                description="전사 또는 소속 부서 운영 지표 및 감사 로그 열람 전용 읽기 사용자",
                is_system=True,
                permissions=[
                    "overview:read", "routing:read", "governance:read",
                    "prompts:read", "finops:read", "compliance:read", "lifecycle:read"
                ]
            )
        ])

    # Seed AgentRouter Policies if empty
    from app.models.agent_router_policy import AgentRouterPolicyModel
    from app.core.agent_router.policy_manager import DEFAULT_POLICIES_CONFIG
    if db.query(AgentRouterPolicyModel).count() == 0:
        for p in DEFAULT_POLICIES_CONFIG:
            db.add(AgentRouterPolicyModel(
                policy_id=p["policy_id"],
                name=p["name"],
                description=p["description"],
                is_active=p["is_active"],
                config=p["config"]
            ))

    db.commit()
    db.close()

seed_data()

@pytest.fixture(autouse=True)
def ensure_db_seeded():
    seed_data()
    yield
