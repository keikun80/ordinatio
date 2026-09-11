from fastapi.testclient import TestClient
from app.main import app
from app.core.security import generate_virtual_key, get_key_hash, verify_key

client = TestClient(app)

def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    assert "AI Orchestrator" in response.json()["message"]

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
    assert data["air_gapped"] is True

def test_system_info():
    response = client.get("/api/v1/system/info")
    assert response.status_code == 200
    data = response.json()
    assert "Air-Gapped" in data["mode"]
    assert "envoy" in data["components"]

def test_virtual_key_generation_and_hashing():
    key = generate_virtual_key()
    assert key.startswith("sk-orch-")
    assert len(key) == 40  # 'sk-orch-' (8) + 32 hex = 40
    
    hashed = get_key_hash(key)
    assert hashed != key
    assert verify_key(key, hashed) is True
    assert verify_key("invalid-key", hashed) is False
