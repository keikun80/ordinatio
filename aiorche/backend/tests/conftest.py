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

    db.commit()
    db.close()

seed_data()

@pytest.fixture(autouse=True)
def ensure_db_seeded():
    seed_data()
    yield
