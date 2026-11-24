import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.models.user import User, UserSession
from app.core.security import hash_password
from app.models.system_setting import SystemSetting
from app.db.system_settings_seed import seed_system_settings

@pytest.fixture
def super_admin_token(client: TestClient, db_session: Session) -> str:
    seed_system_settings(db_session)
    db_session.query(UserSession).delete()
    db_session.query(User).filter(User.username == "sa-setting-test").delete()
    db_session.commit()

    sa = User(
        username="sa-setting-test",
        full_name="시스템 관리자",
        email="sa-setting@ordinatio.local",
        password_hash=hash_password("SuperSecret123!"),
        role="SUPER_ADMIN",
        is_active=True
    )
    db_session.add(sa)
    db_session.commit()

    resp = client.post("/api/v1/auth/login", json={"username": "sa-setting-test", "password": "SuperSecret123!"})
    assert resp.status_code == 200
    return resp.json()["access_token"]

def test_system_settings_public_and_crud(client: TestClient, super_admin_token: str):
    headers = {"Authorization": f"Bearer {super_admin_token}"}

    # 1. Public Settings (No Auth required for UI bootstrap)
    resp = client.get("/api/v1/system-settings/public")
    assert resp.status_code == 200
    pub_data = resp.json()
    assert isinstance(pub_data, dict)
    assert "router_default_models" in pub_data or "llm_providers" in pub_data

    # 2. List Settings with Auth
    resp = client.get("/api/v1/system-settings", headers=headers)
    assert resp.status_code == 200
    settings_list = resp.json()
    assert isinstance(settings_list, list)
    assert len(settings_list) >= 4

    # 3. Create Custom Setting
    custom_key = "test_feature_flag_custom"
    create_payload = {
        "key": custom_key,
        "category": "custom_ops",
        "description": "임의의 사용자 정의 운영 변수 테스트",
        "value": {"enabled": True, "max_retry": 3}
    }
    resp = client.post("/api/v1/system-settings", json=create_payload, headers=headers)
    assert resp.status_code == 201
    created = resp.json()
    assert created["key"] == custom_key
    assert created["value"]["enabled"] is True

    # 4. Get by Key
    resp = client.get(f"/api/v1/system-settings/{custom_key}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["key"] == custom_key

    # 5. Update Setting
    update_payload = {
        "value": {"enabled": False, "max_retry": 5}
    }
    resp = client.put(f"/api/v1/system-settings/{custom_key}", json=update_payload, headers=headers)
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["value"]["enabled"] is False
    assert updated["value"]["max_retry"] == 5

    # 6. Delete Custom Setting
    resp = client.delete(f"/api/v1/system-settings/{custom_key}", headers=headers)
    assert resp.status_code == 204

    # Verify Deletion
    resp = client.get(f"/api/v1/system-settings/{custom_key}", headers=headers)
    assert resp.status_code == 404
