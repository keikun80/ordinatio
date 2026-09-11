import logging
from app.db.base import Base
from app.db.session import engine, SessionLocal
from app.models.tenant import Tenant
from app.models.virtual_key import VirtualKey
from app.models.model_catalog import ModelCatalog
from app.models.routing_policy import RoutingPolicy

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

        # 3. Dynamic Routing Policy
        if db.query(RoutingPolicy).count() == 0:
            default_policy = RoutingPolicy(
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
            )
            db.add(default_policy)
            db.commit()
            logger.info("Initialized database with default routing policy")

        db.close()
    except Exception as e:
        logger.warning(f"Database initialization skipped or deferred: {e}")
