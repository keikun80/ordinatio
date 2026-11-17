import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings
from app.core.security import get_client_real_ip, is_trusted_proxy_ip

@pytest.fixture
def client():
    return TestClient(app)

def test_trusted_proxy_ip_detection():
    """Verify that internal loopback and configured CIDRs are recognized as trusted proxies."""
    assert is_trusted_proxy_ip("127.0.0.1") is True
    assert is_trusted_proxy_ip("localhost") is True
    assert is_trusted_proxy_ip("testclient") is True
    assert is_trusted_proxy_ip("10.0.1.50") is True
    assert is_trusted_proxy_ip("172.16.5.20") is True
    assert is_trusted_proxy_ip("192.168.1.100") is True
    # Public IP should not be trusted by default
    assert is_trusted_proxy_ip("203.0.113.195") is False

def test_get_client_real_ip_behind_alb():
    """Verify extracting real originating client IP from X-Forwarded-For header."""
    class DummyRequest:
        def __init__(self, peer_ip, headers):
            class Client:
                def __init__(self, host):
                    self.host = host
            self.client = Client(peer_ip)
            self.headers = headers

    # 1. Standard AWS ALB with single client IP
    req1 = DummyRequest("10.0.1.20", {"x-forwarded-for": "203.0.113.50"})
    assert get_client_real_ip(req1) == "203.0.113.50"

    # 2. Multi-hop XFF (Client, CloudFront/Proxy, ALB)
    req2 = DummyRequest("172.16.10.5", {"x-forwarded-for": "198.51.100.22, 10.0.2.15"})
    assert get_client_real_ip(req2) == "198.51.100.22"

    # 3. Fallback to X-Real-IP
    req3 = DummyRequest("192.168.0.10", {"x-real-ip": "198.51.100.88"})
    assert get_client_real_ip(req3) == "198.51.100.88"

    # 4. Untrusted public peer attempting XFF spoofing
    req4 = DummyRequest("203.0.113.99", {"x-forwarded-for": "1.1.1.1"})
    assert get_client_real_ip(req4) == "203.0.113.99"

def test_health_check_under_proxy_headers(client):
    """Verify health endpoint responds with HTTP 200 when invoked behind a reverse proxy."""
    headers = {
        "x-forwarded-for": "203.0.113.100",
        "x-forwarded-proto": "https",
        "x-forwarded-port": "443"
    }
    response = client.get("/api/v1/health", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "UP"

def test_root_endpoint_scheme_preservation(client):
    """Verify root endpoint accessible with forwarded proto."""
    headers = {
        "x-forwarded-for": "203.0.113.77",
        "x-forwarded-proto": "https"
    }
    response = client.get("/", headers=headers)
    assert response.status_code == 200
    assert "Ordinatio" in response.json()["message"]
