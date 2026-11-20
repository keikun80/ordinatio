import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import User, UserSession
from app.models.role import Role
from app.models.tenant import Tenant
from app.core.security import hash_password

@pytest.fixture
def super_admin_token(client: TestClient, db_session: Session) -> str:
    # Ensure super admin user exists
    db_session.query(UserSession).delete()
    db_session.query(User).filter(User.username == "sa-role-test").delete()
    db_session.commit()

    sa = User(
        username="sa-role-test",
        full_name="슈퍼 관리자",
        email="sa-role@ordinatio.local",
        password_hash=hash_password("SuperSecret123!"),
        role="SUPER_ADMIN",
        is_active=True
    )
    db_session.add(sa)
    db_session.commit()

    resp = client.post("/api/v1/auth/login", json={"username": "sa-role-test", "password": "SuperSecret123!"})
    assert resp.status_code == 200
    return resp.json()["access_token"]

@pytest.fixture
def viewer_token(client: TestClient, db_session: Session) -> str:
    db_session.query(User).filter(User.username == "viewer-role-test").delete()
    db_session.commit()

    vw = User(
        username="viewer-role-test",
        full_name="일반 조회자",
        email="viewer-role@ordinatio.local",
        password_hash=hash_password("ViewerSecret123!"),
        role="VIEWER",
        is_active=True
    )
    db_session.add(vw)
    db_session.commit()

    resp = client.post("/api/v1/auth/login", json={"username": "viewer-role-test", "password": "ViewerSecret123!"})
    assert resp.status_code == 200
    return resp.json()["access_token"]

def test_list_roles_and_permissions(client: TestClient, super_admin_token: str):
    headers = {"Authorization": f"Bearer {super_admin_token}"}
    
    # List permissions
    res_perm = client.get("/api/v1/roles/permissions", headers=headers)
    assert res_perm.status_code == 200
    perms = res_perm.json()
    assert len(perms) >= 10
    codes = [p["code"] for p in perms]
    assert "overview:read" in codes
    assert "users:write" in codes
    assert "roles:manage" in codes

    # List roles
    res_roles = client.get("/api/v1/roles", headers=headers)
    assert res_roles.status_code == 200
    roles = res_roles.json()
    names = [r["name"] for r in roles]
    assert "SUPER_ADMIN" in names
    assert "TENANT_ADMIN" in names
    assert "VIEWER" in names

def test_create_and_update_custom_role(client: TestClient, super_admin_token: str, db_session: Session):
    headers = {"Authorization": f"Bearer {super_admin_token}"}
    db_session.query(Role).filter(Role.name == "AUDITOR").delete()
    db_session.commit()

    # Create role
    create_payload = {
        "name": "AUDITOR",
        "display_name": "보안 감사관",
        "description": "사내 컴플라이언스 및 WORM 감사 로그 전담 감사관",
        "permissions": ["overview:read", "compliance:read", "compliance:write"]
    }
    res_create = client.post("/api/v1/roles", json=create_payload, headers=headers)
    assert res_create.status_code == 201
    created = res_create.json()
    assert created["name"] == "AUDITOR"
    assert created["display_name"] == "보안 감사관"
    assert created["is_system"] is False
    assert "compliance:read" in created["permissions"]
    role_id = created["id"]

    # Duplicate creation fails
    res_dup = client.post("/api/v1/roles", json=create_payload, headers=headers)
    assert res_dup.status_code == 400

    # Invalid name fails
    res_invalid = client.post("/api/v1/roles", json={
        "name": "invalid-lower-name",
        "display_name": "잘못된 역할",
        "permissions": []
    }, headers=headers)
    assert res_invalid.status_code == 400

    # Update role
    update_payload = {
        "display_name": "수석 보안 감사관",
        "description": "업데이트된 감사관 권한",
        "permissions": ["overview:read", "compliance:read", "compliance:write", "finops:read"]
    }
    res_update = client.patch(f"/api/v1/roles/{role_id}", json=update_payload, headers=headers)
    assert res_update.status_code == 200
    updated = res_update.json()
    assert updated["display_name"] == "수석 보안 감사관"
    assert "finops:read" in updated["permissions"]

def test_system_role_deletion_protection(client: TestClient, super_admin_token: str):
    headers = {"Authorization": f"Bearer {super_admin_token}"}
    
    # Attempt to delete SUPER_ADMIN
    res_del = client.delete("/api/v1/roles/SUPER_ADMIN", headers=headers)
    assert res_del.status_code == 400
    assert "시스템 기본 역할" in res_del.json()["detail"]

def test_role_in_use_deletion_protection_and_cascade(client: TestClient, super_admin_token: str, db_session: Session):
    headers = {"Authorization": f"Bearer {super_admin_token}"}
    
    # Ensure OPERATOR role exists
    db_session.query(User).filter(User.username == "operator-test").delete()
    db_session.query(Role).filter(Role.name == "OPERATOR").delete()
    db_session.commit()

    res_create = client.post("/api/v1/roles", json={
        "name": "OPERATOR",
        "display_name": "모델 서빙 운영자",
        "description": "모델 카탈로그 및 라우팅 운영 담당자",
        "permissions": ["overview:read", "routing:read", "routing:write"]
    }, headers=headers)
    assert res_create.status_code == 201
    role_id = res_create.json()["id"]

    # Assign OPERATOR role to a user
    res_user = client.post("/api/v1/users", json={
        "username": "operator-test",
        "full_name": "운영자 테스트",
        "email": "operator-test@ordinatio.local",
        "password": "OperatorPassword123!",
        "role": "OPERATOR"
    }, headers=headers)
    assert res_user.status_code == 201
    user_id = res_user.json()["id"]

    # Verify user_count in roles list
    res_roles = client.get("/api/v1/roles", headers=headers)
    op_role = next(r for r in res_roles.json() if r["name"] == "OPERATOR")
    assert op_role["user_count"] == 1

    # Attempt to delete role while in use -> MUST fail with 400
    res_del_in_use = client.delete(f"/api/v1/roles/{role_id}", headers=headers)
    assert res_del_in_use.status_code == 400
    assert "사용 중이므로 삭제할 수 없습니다" in res_del_in_use.json()["detail"]

    # Reassign user role to VIEWER
    res_patch_user = client.patch(f"/api/v1/users/{user_id}", json={"role": "VIEWER"}, headers=headers)
    assert res_patch_user.status_code == 200

    # Now deletion must succeed
    res_del_ok = client.delete(f"/api/v1/roles/{role_id}", headers=headers)
    assert res_del_ok.status_code == 204

    # Verify role deleted
    res_roles_after = client.get("/api/v1/roles", headers=headers)
    assert not any(r["name"] == "OPERATOR" for r in res_roles_after.json())

def test_viewer_cannot_modify_roles(client: TestClient, viewer_token: str):
    headers = {"Authorization": f"Bearer {viewer_token}"}
    
    # Viewer cannot create role
    res = client.post("/api/v1/roles", json={
        "name": "HACKER",
        "display_name": "해커",
        "permissions": []
    }, headers=headers)
    assert res.status_code == 403

def test_sec_auditor_read_only_cannot_create_virtual_key(client: TestClient, super_admin_token: str):
    sa_headers = {"Authorization": f"Bearer {super_admin_token}"}

    # 1. Create custom role SEC_AUDITOR with only read permissions (NO governance:write)
    res_role = client.post("/api/v1/roles", json={
        "name": "SEC_AUDITOR",
        "display_name": "보안 감사관",
        "description": "보안 및 거버넌스 감사 전용 조회 역할",
        "permissions": ["governance:read", "compliance:read"]
    }, headers=sa_headers)
    assert res_role.status_code == 201

    # 2. Create user with SEC_AUDITOR role
    res_user = client.post("/api/v1/users", json={
        "username": "auditor-kim",
        "full_name": "김감사",
        "email": "auditor.kim@ordinatio.local",
        "password": "AuditorPassword123!",
        "role": "SEC_AUDITOR"
    }, headers=sa_headers)
    assert res_user.status_code == 201

    # 3. Log in as SEC_AUDITOR user
    login_res = client.post("/api/v1/auth/login", json={
        "username": "auditor-kim",
        "password": "AuditorPassword123!"
    })
    assert login_res.status_code == 200
    auditor_token = login_res.json()["access_token"]
    auditor_headers = {"Authorization": f"Bearer {auditor_token}"}

    # 4. Verify auth/me permissions
    me_res = client.get("/api/v1/auth/me", headers=auditor_headers)
    assert me_res.status_code == 200
    assert "governance:read" in me_res.json()["permissions"]
    assert "governance:write" not in me_res.json()["permissions"]

    # 5. SEC_AUDITOR can READ virtual keys (governance:read)
    get_res = client.get("/api/v1/virtual-keys", headers=auditor_headers)
    assert get_res.status_code == 200

    # 6. SEC_AUDITOR CANNOT create virtual key (MUST return 403 Forbidden)
    post_res = client.post("/api/v1/virtual-keys", json={
        "name": "감사관_불법_키_발급시도",
        "tenant_id": "dept-wm",
        "allowed_models": ["vllm/qwen2.5-72b-instruct"],
        "rpm_limit": 100,
        "tpm_limit": 100000
    }, headers=auditor_headers)
    assert post_res.status_code == 403
    assert "governance:write" in post_res.json()["detail"]

    # 7. SEC_AUDITOR CANNOT modify, revoke, or delete keys
    revoke_res = client.patch("/api/v1/virtual-keys/vk-dummy/revoke", json={
        "revoked_reason": "테스트"
    }, headers=auditor_headers)
    assert revoke_res.status_code == 403
    assert "governance:write" in revoke_res.json()["detail"]

    del_res = client.delete("/api/v1/virtual-keys/vk-dummy", headers=auditor_headers)
    assert del_res.status_code == 403
    assert "governance:write" in del_res.json()["detail"]

    # 8. SEC_AUDITOR CANNOT read unauthorized domains (routing, prompts, finops, users, roles)
    assert client.get("/api/v1/models", headers=auditor_headers).status_code == 403
    assert client.get("/api/v1/system-prompts", headers=auditor_headers).status_code == 403
    assert client.get("/api/v1/finops/overview", headers=auditor_headers).status_code == 403
    assert client.get("/api/v1/users", headers=auditor_headers).status_code == 403
    assert client.get("/api/v1/roles", headers=auditor_headers).status_code == 403

    # 9. SUPER_ADMIN CAN create virtual key (Full access)
    sa_create = client.post("/api/v1/virtual-keys", json={
        "name": "관리자_정상_키_발급",
        "tenant_id": "dept-wm",
        "allowed_models": ["vllm/qwen2.5-72b-instruct"],
        "rpm_limit": 200,
        "tpm_limit": 200000
    }, headers=sa_headers)
    assert sa_create.status_code == 201
    created_key_id = sa_create.json()["key_id"]

    # Cleanup created key
    client.delete(f"/api/v1/virtual-keys/{created_key_id}?force=true", headers=sa_headers)


def test_all_domains_pbac_enforcement(client: TestClient, super_admin_token: str, db_session: Session):
    """
    전 도메인 PBAC 검증:
    - VIEWER(조회 전용) 또는 커스텀 조회 역할(GLOBAL_READER) 계정이
      모든 도메인의 :read 엔드포인트에는 200 OK로 접근하고,
      모든 도메인의 :write / :manage 엔드포인트에서는 403 Forbidden으로 차단됨을 검증.
    """
    sa_headers = {"Authorization": f"Bearer {super_admin_token}"}

    # Clean up previous test state if exists
    db_session.query(User).filter(User.username == "global-reader").delete()
    db_session.query(Role).filter(Role.name == "GLOBAL_READER").delete()
    db_session.commit()

    # 1. 모든 도메인 조회 권한만 가진 GLOBAL_READER 역할 생성
    res_role = client.post("/api/v1/roles", json={
        "name": "GLOBAL_READER",
        "display_name": "전사 통합 조회자",
        "description": "전 도메인 조회 전용 권한",
        "permissions": [
            "overview:read",
            "routing:read",
            "governance:read",
            "prompts:read",
            "finops:read",
            "compliance:read",
            "lifecycle:read",
            "users:read"
        ]
    }, headers=sa_headers)
    assert res_role.status_code == 201

    # 2. GLOBAL_READER 계정 생성 및 로그인
    res_user = client.post("/api/v1/users", json={
        "username": "global-reader",
        "full_name": "전사조회자",
        "email": "reader@ordinatio.local",
        "password": "ReaderPassword123!",
        "role": "GLOBAL_READER"
    }, headers=sa_headers)
    assert res_user.status_code == 201

    login_res = client.post("/api/v1/auth/login", json={
        "username": "global-reader",
        "password": "ReaderPassword123!"
    })
    assert login_res.status_code == 200
    reader_headers = {"Authorization": f"Bearer {login_res.json()['access_token']}"}

    # 3. READ 엔드포인트 허용(200 OK) 검증
    assert client.get("/api/v1/observability/metrics/summary", headers=reader_headers).status_code == 200
    assert client.get("/api/v1/models", headers=reader_headers).status_code == 200
    assert client.get("/api/v1/routing", headers=reader_headers).status_code == 200
    assert client.get("/api/v1/tenants", headers=reader_headers).status_code == 200
    assert client.get("/api/v1/virtual-keys", headers=reader_headers).status_code == 200
    assert client.get("/api/v1/system-prompts", headers=reader_headers).status_code == 200
    assert client.get("/api/v1/finops/overview", headers=reader_headers).status_code == 200
    assert client.get("/api/v1/compliance/rules", headers=reader_headers).status_code == 200
    assert client.get("/api/v1/lifecycle/components", headers=reader_headers).status_code == 200
    assert client.get("/api/v1/users", headers=reader_headers).status_code == 200

    # 4. WRITE / MANAGE 엔드포인트 차단(403 Forbidden) 검증
    # Models write
    assert client.post("/api/v1/models", json={}, headers=reader_headers).status_code == 403
    assert client.delete("/api/v1/models/dummy", headers=reader_headers).status_code == 403
    # Routing write
    assert client.post("/api/v1/routing/deploy", json={"route_name": "r", "weights": []}, headers=reader_headers).status_code == 403
    assert client.delete("/api/v1/routing/routes/dummy", headers=reader_headers).status_code == 403
    # Governance write (Tenants & Virtual Keys)
    assert client.post("/api/v1/tenants", json={}, headers=reader_headers).status_code == 403
    assert client.delete("/api/v1/tenants/dept-wm", headers=reader_headers).status_code == 403
    assert client.post("/api/v1/virtual-keys", json={}, headers=reader_headers).status_code == 403
    # System Prompts write
    assert client.post("/api/v1/system-prompts", json={}, headers=reader_headers).status_code == 403
    assert client.delete("/api/v1/system-prompts/sp-dummy", headers=reader_headers).status_code == 403
    # FinOps write
    assert client.get("/api/v1/finops/invoices/export", headers=reader_headers).status_code == 403
    assert client.patch("/api/v1/external/tenants/dept-wm/budget", json={}, headers=reader_headers).status_code == 403
    # Compliance write
    assert client.post("/api/v1/compliance/rules", json={}, headers=reader_headers).status_code == 403
    assert client.delete("/api/v1/compliance/rules/pii-dummy", headers=reader_headers).status_code == 403
    # Lifecycle write
    assert client.post("/api/v1/lifecycle/patches/apply", json={}, headers=reader_headers).status_code == 403
    assert client.post("/api/v1/lifecycle/support-bundle", json={}, headers=reader_headers).status_code == 403
    # Users write & Roles manage
    assert client.post("/api/v1/users", json={}, headers=reader_headers).status_code == 403
    assert client.delete("/api/v1/users/u-dummy", headers=reader_headers).status_code == 403
    assert client.post("/api/v1/roles", json={}, headers=reader_headers).status_code == 403
    assert client.delete("/api/v1/roles/r-dummy", headers=reader_headers).status_code == 403


def test_custom_admin_can_access_users_roles_and_tenants(client: TestClient, super_admin_token: str, db_session: Session):
    """
    검증: 신규 어드민 역할(users:read/write, roles:manage 보유)을 가진 사용자가
    governance:read를 명시적으로 부여받지 않더라도, 사용자 관리에 필수적인 /tenants 조회가
    403 Forbidden 없이 정상 200 OK로 조회되는지 확인.
    """
    headers = {"Authorization": f"Bearer {super_admin_token}"}
    db_session.query(User).filter(User.username == "custom-admin-tester").delete()
    db_session.query(Role).filter(Role.name == "USER_ROLE_ADMIN").delete()
    db_session.commit()

    # 1. 새 커스텀 역할 생성 (users:read, users:write, roles:manage)
    create_payload = {
        "name": "USER_ROLE_ADMIN",
        "display_name": "계정 및 권한 관리자",
        "description": "사용자 및 역할 관리만 전담하는 커스텀 어드민",
        "permissions": ["overview:read", "users:read", "users:write", "roles:manage"]
    }
    res_role = client.post("/api/v1/roles", json=create_payload, headers=headers)
    assert res_role.status_code == 201

    # 2. 사용자 생성
    tenant = db_session.query(Tenant).first()
    user_payload = {
        "username": "custom-admin-tester",
        "full_name": "커스텀 관리자",
        "email": "custom-admin-tester@ordinatio.local",
        "password": "Password123!",
        "role": "USER_ROLE_ADMIN",
        "tenant_id": tenant.tenant_id if tenant else None
    }
    res_user = client.post("/api/v1/users", json=user_payload, headers=headers)
    assert res_user.status_code == 201

    # 3. 로그인 및 토큰 획득
    login_resp = client.post("/api/v1/auth/login", json={"username": "custom-admin-tester", "password": "Password123!"})
    assert login_resp.status_code == 200
    custom_token = login_resp.json()["access_token"]
    custom_headers = {"Authorization": f"Bearer {custom_token}"}

    # 4. UsersTab의 4개 필수 API 호출 검증
    assert client.get("/api/v1/users", headers=custom_headers).status_code == 200
    assert client.get("/api/v1/roles", headers=custom_headers).status_code == 200
    assert client.get("/api/v1/roles/permissions", headers=custom_headers).status_code == 200
    # 핵심: tenants도 users:read 권한에 의해 200 OK로 정상 조회되어야 함!
    res_tenants = client.get("/api/v1/tenants", headers=custom_headers)
    assert res_tenants.status_code == 200
    assert isinstance(res_tenants.json(), list)



