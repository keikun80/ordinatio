import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.security import generate_virtual_key, hash_virtual_key
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
        "/api/v1/chat/completions",
        headers={"Authorization": f"Bearer {raw_key}"},
        json={
            "model": "meta-llama/Llama-3-8B-Instruct",
            "messages": [{"role": "user", "content": "단순 인사말"}]
        }
    )
    assert res_allowed.status_code != 403
