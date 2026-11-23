from fastapi.testclient import TestClient
from app.main import app
from app.core.security import generate_virtual_key, get_key_hash, verify_key

client = TestClient(app)

def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    assert "Ordinatio" in response.json()["message"]

def test_root_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"

def test_health_check():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "UP"
    assert "version" in data

def test_readiness_check():
    response = client.get("/api/v1/health/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "READY"
    assert data["database"] == "CONNECTED"
    assert "database_latency_ms" in data
    assert isinstance(data["database_latency_ms"], (int, float))
    assert data["database_latency_ms"] >= 0.0
    assert "redis" in data
    assert data["redis"] in ["CONNECTED", "IN_MEMORY_FALLBACK"]
    assert "redis_latency_ms" in data
    assert data["air_gapped"] is True

def test_readiness_check_failure_when_db_down(monkeypatch):
    """Test readiness check returns 503 and NOT_READY when DB connectivity fails."""
    from unittest.mock import MagicMock
    from app.db import session as db_session
    mock_session = MagicMock()
    mock_session.execute.side_effect = Exception("DB Connection Lost")
    mock_ctx = MagicMock()
    mock_ctx.__enter__.return_value = mock_session
    mock_ctx.__exit__.return_value = None
    monkeypatch.setattr(db_session, "SessionLocal", lambda: mock_ctx)

    response = client.get("/api/v1/health/ready")
    assert response.status_code == 503
    data = response.json()
    assert data["status"] == "NOT_READY"
    assert data["database"] == "DISCONNECTED"

def test_system_info():
    response = client.get("/api/v1/system/info")
    assert response.status_code == 200
    data = response.json()
    assert "Air-Gapped" in data["mode"]
    assert "data_plane_healthy" in data
    assert isinstance(data["data_plane_healthy"], bool)
    components = data["components"]
    assert "envoy" in components
    assert "ext_proc" in components
    assert "presidio" in components
    assert "control_plane" in components

def test_virtual_key_generation_and_hashing():
    key = generate_virtual_key()
    assert key.startswith("sk-ord-")
    assert len(key) == 39  # 'sk-ord-' (7) + 32 hex = 39
    
    hashed = get_key_hash(key)
    assert hashed != key
    assert verify_key(key, hashed) is True
    assert verify_key("invalid-key", hashed) is False


def test_init_db_zero_demo_data_by_default(monkeypatch):
    """Verify that init_db() with SEED_DEMO_DATA=False does not insert any fake demo data."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    import app.db.init_db as init_db_mod
    from app.core.config import settings
    from app.models.tenant import Tenant
    from app.models.model_catalog import ModelCatalog
    from app.models.routing_policy import RoutingPolicy
    from app.models.audit_log import AuditLog
    from app.models.system_prompt import SystemPrompt
    from app.models.role import Role
    from app.models.agent_router_policy import AgentRouterPolicyModel

    clean_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    CleanSession = sessionmaker(autocommit=False, autoflush=False, bind=clean_engine)

    monkeypatch.setattr(init_db_mod, "engine", clean_engine)
    monkeypatch.setattr(init_db_mod, "SessionLocal", CleanSession)
    monkeypatch.setattr(settings, "SEED_DEMO_DATA", False)

    init_db_mod.init_db()

    with CleanSession() as db:
        assert db.query(Tenant).count() == 0
        assert db.query(ModelCatalog).count() == 0
        assert db.query(RoutingPolicy).count() == 0
        assert db.query(AuditLog).count() == 0
        assert db.query(SystemPrompt).count() == 0
        # Essential system roles (3), initial SUPER_ADMIN (1), and empty AgentRouter strategy slots (4) must exist
        from app.models.user import User
        assert db.query(Role).count() == 3
        initial_admin = db.query(User).filter(User.username == settings.INITIAL_ADMIN_USERNAME).first()
        assert initial_admin is not None
        assert initial_admin.role == "SUPER_ADMIN"
        ar_policies = db.query(AgentRouterPolicyModel).all()
        assert len(ar_policies) == 4
        for p in ar_policies:
            assert "meta-llama" not in str(p.config)
