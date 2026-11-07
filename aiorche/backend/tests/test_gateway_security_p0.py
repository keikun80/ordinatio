import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.security import generate_virtual_key, hash_virtual_key, SYSTEM_DIAGNOSTICS_KEY
from app.models.virtual_key import VirtualKey
from tests.conftest import TestSessionLocal

@pytest.fixture
def db_session():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()

def test_mock_key_rejected_when_allow_dev_mock_keys_is_false(client: TestClient, monkeypatch):
    """
    보안 검증 1: settings.ALLOW_DEV_MOCK_KEYS = False 인 경우
    임의의 sk-orch-test-* 또는 sk-orch-your-virtual-key 요청이 401로 차단되는지 검증
    """
    monkeypatch.setattr(settings, "ALLOW_DEV_MOCK_KEYS", False)

    # 1. sk-orch-your-virtual-key
    res1 = client.post(
        "/v1/chat/completions",
        headers={"Authorization": "Bearer sk-orch-your-virtual-key"},
        json={
            "model": "meta-llama/Llama-3-8B-Instruct",
            "messages": [{"role": "user", "content": "Hello test"}]
        }
    )
    assert res1.status_code == 401
    assert "등록되지 않았거나 유효하지 않은 가상 API Key" in res1.json()["detail"]

    # 2. sk-orch-test-hacker
    res2 = client.post(
        "/v1/chat/completions",
        headers={"Authorization": "Bearer sk-orch-test-hacker-bypass"},
        json={
            "model": "meta-llama/Llama-3-8B-Instruct",
            "messages": [{"role": "user", "content": "Hello test"}]
        }
    )
    assert res2.status_code == 401
    assert "등록되지 않았거나 유효하지 않은 가상 API Key" in res2.json()["detail"]


def test_expired_virtual_key_rejected(client: TestClient, db_session):
    """
    보안 검증 2: 만료된 가상 API Key(expires_at < now)로 요청 시 HTTP 403 차단 검증
    """
    raw_key = generate_virtual_key()
    prefix = raw_key[:16]
    hashed = hash_virtual_key(raw_key)

    expired_key = VirtualKey(
        key_id="vk-expired-test",
        key_hash=hashed,
        key_prefix=prefix,
        tenant_id="dept-wm",
        name="만료된 가상키",
        allowed_models=[],
        allowed_ip_cidrs=[],
        rpm_limit=100,
        tpm_limit=50000,
        is_active=True,
        expires_at=datetime.now(timezone.utc) - timedelta(days=1)
    )
    db_session.add(expired_key)
    db_session.commit()

    res = client.post(
        "/v1/chat/completions",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "model": "meta-llama/Llama-3-8B-Instruct",
            "messages": [{"role": "user", "content": "만료 키 테스트"}]
        }
    )
    assert res.status_code == 403
    assert "유효기간이 만료된 가상 API Key입니다." in res.json()["detail"]


def test_ip_cidr_filtering(client: TestClient, db_session):
    """
    보안 검증 3: IP CIDR 화이트리스트 검증
    - 비인가 IP 대역에서 요청 시 403 차단
    - 허용된 IP 대역에서 요청 시 IP 통과
    """
    raw_key = generate_virtual_key()
    prefix = raw_key[:16]
    hashed = hash_virtual_key(raw_key)

    ip_restricted_key = VirtualKey(
        key_id="vk-ip-restricted-test",
        key_hash=hashed,
        key_prefix=prefix,
        tenant_id="dept-wm",
        name="사내망 전용 가상키",
        allowed_models=[],
        allowed_ip_cidrs=["10.100.0.0/16", "192.168.10.5"],
        rpm_limit=100,
        tpm_limit=50000,
        is_active=True,
        expires_at=datetime.now(timezone.utc) + timedelta(days=30)
    )
    db_session.add(ip_restricted_key)
    db_session.commit()

    # 1. 비인가 IP 대역 (203.0.113.195)
    res_blocked = client.post(
        "/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {raw_key}",
            "X-Forwarded-For": "203.0.113.195"
        },
        json={
            "model": "meta-llama/Llama-3-8B-Instruct",
            "messages": [{"role": "user", "content": "외부 IP 요청"}]
        }
    )
    assert res_blocked.status_code == 403
    assert "접속이 허용되지 않은 클라이언트 IP 대역입니다" in res_blocked.json()["detail"]

    # 2. 인가된 CIDR 내부 IP (10.100.25.14)
    # 업스트림 서버가 없어 502 Bad Gateway(또는 시뮬레이션)가 발생하지만 403 IP 차단은 통과함을 확인
    res_allowed = client.post(
        "/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {raw_key}",
            "X-Forwarded-For": "10.100.25.14"
        },
        json={
            "model": "meta-llama/Llama-3-8B-Instruct",
            "messages": [{"role": "user", "content": "사내망 요청"}]
        }
    )
    assert res_allowed.status_code != 403


def test_model_authorization_restriction(client: TestClient, db_session):
    """
    보안 검증 4: allowed_models 인가 정책 검증
    - 비인가 모델 호출 시 403 차단
    - 허용된 모델 호출 시 정상 인가
    """
    raw_key = generate_virtual_key()
    prefix = raw_key[:16]
    hashed = hash_virtual_key(raw_key)

    model_restricted_key = VirtualKey(
        key_id="vk-model-restricted-test",
        key_hash=hashed,
        key_prefix=prefix,
        tenant_id="dept-wm",
        name="경량 모델 전용 키",
        allowed_models=["meta-llama/Llama-3-8B-Instruct"],
        allowed_ip_cidrs=[],
        rpm_limit=100,
        tpm_limit=50000,
        is_active=True,
        expires_at=datetime.now(timezone.utc) + timedelta(days=30)
    )
    db_session.add(model_restricted_key)
    db_session.commit()

    # 1. 비인가 모델 (deepseek-ai/DeepSeek-R1-Distill-Qwen-70B) 명시 요청 -> 403 차단
    res_disallowed = client.post(
        "/v1/chat/completions",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "model": "deepseek-ai/DeepSeek-R1-Distill-Qwen-70B",
            "messages": [{"role": "user", "content": "심층 알고리즘 코드 짜줘"}]
        }
    )
    assert res_disallowed.status_code == 403
    assert "가상 API Key에 부여된 권한으로는 요청 모델" in res_disallowed.json()["detail"]

    # 2. 허용된 모델 (meta-llama/Llama-3-8B-Instruct) 명시 요청 -> 403 인가 거부 통과
    res_allowed = client.post(
        "/v1/chat/completions",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "model": "meta-llama/Llama-3-8B-Instruct",
            "messages": [{"role": "user", "content": "단순 인사말"}]
        }
    )
    assert res_allowed.status_code != 403


def test_system_diagnostics_key_allowed_in_strict_production(client: TestClient, monkeypatch):
    """
    보안 검증 5: settings.ALLOW_DEV_MOCK_KEYS = False 상태에서도
    DB에 정식 등록된 SYSTEM_DIAGNOSTICS_KEY를 통한 요청은 401/403으로 차단되지 않음
    """
    from app.core.security import SYSTEM_DIAGNOSTICS_KEY
    monkeypatch.setattr(settings, "ALLOW_DEV_MOCK_KEYS", False)

    res = client.post(
        "/v1/chat/completions",
        headers={"Authorization": f"Bearer {SYSTEM_DIAGNOSTICS_KEY}"},
        json={
            "model": "meta-llama/Llama-3-8B-Instruct",
            "messages": [{"role": "user", "content": "시스템 진단 테스트"}]
        }
    )
    # 인증(401) 또는 권한(403) 거부되지 않고 정상 통과 (업스트림 상태에 따라 200 또는 502)
    assert res.status_code not in [401, 403]


def test_routing_test_call_uses_system_diagnostics_key_and_succeeds(client: TestClient, db_session, monkeypatch):
    """
    보안 검증 6: 라우팅 탭의 '게이트웨이 즉시 호출 테스트'(/api/v1/routing/test-call)가
    ALLOW_DEV_MOCK_KEYS = False 상태에서도 401/403 오류 없이 정상 동작함
    """
    from app.models.user import User
    from app.core.security import hash_password

    monkeypatch.setattr(settings, "ALLOW_DEV_MOCK_KEYS", False)

    db_session.query(User).filter(User.username == "sa-diag-test").delete()
    db_session.commit()
    sa = User(
        username="sa-diag-test",
        full_name="진단 관리자",
        email="sa-diag@aiorche.local",
        password_hash=hash_password("DiagSecret123!"),
        role="SUPER_ADMIN",
        is_active=True
    )
    db_session.add(sa)
    db_session.commit()

    login_res = client.post(
        "/api/v1/auth/login",
        json={"username": "sa-diag-test", "password": "DiagSecret123!"}
    )
    assert login_res.status_code == 200
    admin_token = login_res.json()["access_token"]

    res = client.post(
        "/api/v1/routing/test-call",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "route_name": "financial-advisor-v1",
            "method": "header",
            "message": "라우팅 테스트",
            "traffic_weights": [{"model_id": "meta-llama/Llama-3-8B-Instruct", "weight": 100}]
        }
    )
    assert res.status_code == 200
    data = res.json()
    assert data["request_headers"].get("Authorization") == f"Bearer {SYSTEM_DIAGNOSTICS_KEY}"
    assert data["dispatched_route"] == "financial-advisor-v1"


def test_c1_system_diagnostics_key_not_static_and_blocked_from_external_ip(client: TestClient, monkeypatch):
    """
    보안 검증 7 (C-1): SYSTEM_DIAGNOSTICS_KEY는 하드코딩된 평문이 아닌 SECRET_KEY 기반 HMAC 파생 키이며,
    외부 공인 IP(예: 203.0.113.195)에서 호출 시 403 Forbidden으로 차단됨
    """
    from app.core.security import SYSTEM_DIAGNOSTICS_KEY
    assert SYSTEM_DIAGNOSTICS_KEY != "sk-orch-system-diagnostics-appliance-key"
    assert SYSTEM_DIAGNOSTICS_KEY.startswith("sk-orch-diag-")

    monkeypatch.setattr(settings, "ALLOW_DEV_MOCK_KEYS", False)
    res_ext = client.post(
        "/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {SYSTEM_DIAGNOSTICS_KEY}",
            "X-Forwarded-For": "203.0.113.195"
        },
        json={
            "model": "meta-llama/Llama-3-8B-Instruct",
            "messages": [{"role": "user", "content": "외부에서 진단키 도용 시도"}]
        }
    )
    assert res_ext.status_code == 403
    assert "접속이 허용되지 않은 클라이언트 IP 대역입니다" in res_ext.json()["detail"]


def test_c2_ssrf_validation_blocks_metadata_and_internal_ports():
    """
    보안 검증 8 (C-2): validate_upstream_endpoint_url이 클라우드 메타데이터(169.254.169.254),
    비-HTTP 스킴(file://), 내부 제어 포트(5432, 6379, 9901, 18000)를 차단함
    """
    from app.core.security import validate_upstream_endpoint_url

    for malicious_url in [
        "http://169.254.169.254/latest/meta-data/",
        "http://envoy:9901/quitquitquit",
        "http://127.0.0.1:6379/",
        "http://postgres:5432/",
        "file:///etc/passwd",
    ]:
        with pytest.raises(ValueError):
            validate_upstream_endpoint_url(malicious_url)

    # 정상 서빙 엔드포인트는 통과
    assert validate_upstream_endpoint_url("http://192.168.1.50:8000/v1/chat/completions") == "http://192.168.1.50:8000/v1/chat/completions"


def test_h1_xff_header_spoofing_prevented(client: TestClient, db_session):
    """
    보안 검증 9 (H-1): 클라이언트가 X-Forwarded-For 앞에 허용 IP를 위조하여 전송하더라도
    Envoy가 끝에 추가한 실제 클라이언트 IP(우측 끝 hop)를 기준으로 검증하여 403 차단함
    """
    raw_key = generate_virtual_key()
    spoof_target_key = VirtualKey(
        key_id="vk-xff-spoof-test",
        key_hash=hash_virtual_key(raw_key),
        key_prefix=raw_key[:16],
        tenant_id="dept-wm",
        name="XFF 스푸핑 방어 검증 키",
        allowed_models=[],
        allowed_ip_cidrs=["10.100.0.0/16"],
        rpm_limit=100,
        tpm_limit=50000,
        is_active=True,
        expires_at=datetime.now(timezone.utc) + timedelta(days=30)
    )
    db_session.add(spoof_target_key)
    db_session.commit()

    # 공격자가 "X-Forwarded-For: 10.100.25.14"를 위조해 보냈으나 프록시가 실제 IP "203.0.113.195"를 우측에 추가한 상황
    res_spoofed = client.post(
        "/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {raw_key}",
            "X-Forwarded-For": "10.100.25.14, 203.0.113.195"
        },
        json={
            "model": "meta-llama/Llama-3-8B-Instruct",
            "messages": [{"role": "user", "content": "XFF 스푸핑 요청"}]
        }
    )
    assert res_spoofed.status_code == 403
    assert "203.0.113.195" in res_spoofed.json()["detail"]
