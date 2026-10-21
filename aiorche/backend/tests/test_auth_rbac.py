import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.models.user import User, UserSession
from app.models.tenant import Tenant
from app.core.security import hash_password, verify_password
from app.scripts.init_admin import init_super_admin

@pytest.fixture
def auth_client(client: TestClient, db_session: Session):
    # Ensure a tenant exists
    tenant = db_session.query(Tenant).filter(Tenant.tenant_id == "dept-wm").first()
    if not tenant:
        tenant = Tenant(
            tenant_id="dept-wm",
            name="자산관리부",
            department_code="WM-TEST",
            monthly_budget_krw=10000000.0,
            spent_budget_krw=0.0
        )
        db_session.add(tenant)
        db_session.commit()

    # Clear test users
    db_session.query(UserSession).delete()
    db_session.query(User).filter(User.username.like("test-%")).delete()
    db_session.query(User).filter(User.username == "admin-test").delete()
    db_session.commit()
    yield client

def test_init_admin_script(db_session: Session):
    """Test initial Super Admin bootstrapping script."""
    ret = init_super_admin(
        username="admin-test",
        full_name="테스트 최고관리자",
        email="admin-test@aiorche.local",
        password="SuperPassword123!"
    )
    assert ret == 0

    admin = db_session.query(User).filter(User.username == "admin-test").first()
    assert admin is not None
    assert admin.role == "SUPER_ADMIN"
    assert admin.is_active is True
    assert verify_password("SuperPassword123!", admin.password_hash)

def test_login_success_and_me(auth_client: TestClient, db_session: Session):
    """Test successful login and retrieving profile via /auth/me."""
    # Create test user
    u = User(
        username="test-user-01",
        full_name="홍길동",
        email="hong@aiorche.local",
        password_hash=hash_password("ValidPassword123!"),
        role="TENANT_ADMIN",
        tenant_id="dept-wm",
        is_active=True
    )
    db_session.add(u)
    db_session.commit()

    # 1. Login
    res = auth_client.post("/api/v1/auth/login", json={
        "username": "test-user-01",
        "password": "ValidPassword123!"
    })
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["username"] == "test-user-01"
    assert data["user"]["role"] == "TENANT_ADMIN"
    assert data["user"]["tenant_id"] == "dept-wm"
    token = data["access_token"]

    # 2. Call /auth/me with Bearer token
    me_res = auth_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data["username"] == "test-user-01"
    assert me_data["role"] == "TENANT_ADMIN"

def test_login_invalid_password_and_failed_count(auth_client: TestClient, db_session: Session):
    """Test failed password increments failure count."""
    u = User(
        username="test-user-fail",
        full_name="실패자",
        email="fail@aiorche.local",
        password_hash=hash_password("CorrectPassword123!"),
        role="VIEWER",
        is_active=True
    )
    db_session.add(u)
    db_session.commit()

    res = auth_client.post("/api/v1/auth/login", json={
        "username": "test-user-fail",
        "password": "WrongPassword!"
    })
    assert res.status_code == 401
    assert "연속 실패 1/5회" in res.json()["detail"]

    db_session.refresh(u)
    assert u.failed_login_count == 1

def test_account_lockout_after_5_failures(auth_client: TestClient, db_session: Session):
    """Test 5 consecutive failed logins trigger 15-minute account lockout."""
    u = User(
        username="test-user-lock",
        full_name="잠금테스트",
        email="lock@aiorche.local",
        password_hash=hash_password("SecretPassword123!"),
        role="VIEWER",
        is_active=True
    )
    db_session.add(u)
    db_session.commit()

    # Fail 4 times
    for i in range(1, 5):
        res = auth_client.post("/api/v1/auth/login", json={
            "username": "test-user-lock",
            "password": f"Wrong_{i}"
        })
        assert res.status_code == 401

    # 5th failure -> triggers lock
    res5 = auth_client.post("/api/v1/auth/login", json={
        "username": "test-user-lock",
        "password": "Wrong_5"
    })
    assert res5.status_code == 403
    assert "계정이 15분간 잠겼습니다" in res5.json()["detail"]

    db_session.refresh(u)
    assert u.failed_login_count == 5
    assert u.locked_until is not None

    # Even with correct password, login is blocked while locked
    res_correct = auth_client.post("/api/v1/auth/login", json={
        "username": "test-user-lock",
        "password": "SecretPassword123!"
    })
    assert res_correct.status_code == 403
    assert "계정이 잠겨 있습니다" in res_correct.json()["detail"]

def test_single_active_session_enforcement(auth_client: TestClient, db_session: Session):
    """Test duplicate login revokes previous active session."""
    u = User(
        username="test-user-multisession",
        full_name="중복세션",
        email="multi@aiorche.local",
        password_hash=hash_password("MyMultiPass123!"),
        role="TENANT_ADMIN",
        is_active=True
    )
    db_session.add(u)
    db_session.commit()

    # 1. Login from PC-1
    res1 = auth_client.post("/api/v1/auth/login", json={
        "username": "test-user-multisession",
        "password": "MyMultiPass123!"
    })
    assert res1.status_code == 200
    token_pc1 = res1.json()["access_token"]

    # Verify PC-1 is working
    chk1 = auth_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token_pc1}"})
    assert chk1.status_code == 200

    # 2. Login from PC-2 with same account
    res2 = auth_client.post("/api/v1/auth/login", json={
        "username": "test-user-multisession",
        "password": "MyMultiPass123!"
    })
    assert res2.status_code == 200
    token_pc2 = res2.json()["access_token"]

    # 3. PC-1 attempts request -> should be 401 session revoked
    chk1_after = auth_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token_pc1}"})
    assert chk1_after.status_code == 401
    assert "다른 기기에서 로그인되어 종료되었습니다" in chk1_after.json()["detail"]

    # 4. PC-2 request -> works normally
    chk2 = auth_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token_pc2}"})
    assert chk2.status_code == 200

def test_inactivity_timeout_30m(auth_client: TestClient, db_session: Session):
    """Test 30-minute inactivity terminates session."""
    u = User(
        username="test-user-timeout",
        full_name="타임아웃",
        email="timeout@aiorche.local",
        password_hash=hash_password("TimeoutPass123!"),
        role="VIEWER",
        is_active=True
    )
    db_session.add(u)
    db_session.commit()

    login_res = auth_client.post("/api/v1/auth/login", json={
        "username": "test-user-timeout",
        "password": "TimeoutPass123!"
    })
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]

    # Simulate 31 minutes of inactivity
    session = db_session.query(UserSession).filter(UserSession.user_id == u.id).first()
    session.last_activity_at = datetime.utcnow() - timedelta(minutes=31)
    db_session.commit()

    # Request after timeout -> 401
    res = auth_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401
    assert "활동이 없어 세션이 만료되었습니다" in res.json()["detail"]

def test_rbac_super_admin_vs_tenant_admin(auth_client: TestClient, db_session: Session):
    """Test SUPER_ADMIN can manage users while TENANT_ADMIN and VIEWER are forbidden."""
    super_admin = User(
        username="test-super",
        full_name="슈퍼관리자",
        email="super@aiorche.local",
        password_hash=hash_password("SuperPass123!"),
        role="SUPER_ADMIN",
        is_active=True
    )
    tenant_admin = User(
        username="test-tenant",
        full_name="부서관리자",
        email="tenant@aiorche.local",
        password_hash=hash_password("TenantPass123!"),
        role="TENANT_ADMIN",
        tenant_id="dept-wm",
        is_active=True
    )
    db_session.add_all([super_admin, tenant_admin])
    db_session.commit()

    token_super = auth_client.post("/api/v1/auth/login", json={
        "username": "test-super", "password": "SuperPass123!"
    }).json()["access_token"]

    token_tenant = auth_client.post("/api/v1/auth/login", json={
        "username": "test-tenant", "password": "TenantPass123!"
    }).json()["access_token"]

    # 1. TENANT_ADMIN calls /api/v1/users -> 403 Forbidden
    res_denied = auth_client.get("/api/v1/users", headers={"Authorization": f"Bearer {token_tenant}"})
    assert res_denied.status_code == 403
    assert "접근 권한이 없습니다" in res_denied.json()["detail"]

    # 2. SUPER_ADMIN calls /api/v1/users -> 200 OK
    res_allowed = auth_client.get("/api/v1/users", headers={"Authorization": f"Bearer {token_super}"})
    assert res_allowed.status_code == 200
    user_list = res_allowed.json()
    assert len(user_list) >= 2

    # 3. SUPER_ADMIN creates a new user
    create_res = auth_client.post("/api/v1/users", json={
        "username": "test-new-operator",
        "password": "NewOperatorPass123!",
        "full_name": "신규운영자",
        "email": "operator@aiorche.local",
        "role": "VIEWER",
        "tenant_id": "dept-wm"
    }, headers={"Authorization": f"Bearer {token_super}"})
    assert create_res.status_code == 201
    assert create_res.json()["username"] == "test-new-operator"
