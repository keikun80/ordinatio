import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone

from app.models.user import User, UserSession
from app.models.role import Role
from app.models.tenant import Tenant
from app.core.security import hash_password

@pytest.fixture
def setup_tenants_and_admin(client: TestClient, db_session: Session):
    db_session.query(UserSession).delete()
    db_session.query(User).filter(User.username.in_([
        "sec-super-admin", "sec-dept-a-admin", "sec-dept-b-user", "sec-custom-op"
    ])).delete()
    db_session.query(Role).filter(Role.name == "USER_OPERATOR").delete()
    db_session.commit()

    # Ensure two separate tenants
    t_a = db_session.query(Tenant).filter(Tenant.tenant_id == "tenant-sec-a").first()
    if not t_a:
        t_a = Tenant(tenant_id="tenant-sec-a", name="보안A부서", department_code="DEPT-SEC-A", monthly_budget_krw=10000000)
        db_session.add(t_a)
    t_b = db_session.query(Tenant).filter(Tenant.tenant_id == "tenant-sec-b").first()
    if not t_b:
        t_b = Tenant(tenant_id="tenant-sec-b", name="보안B부서", department_code="DEPT-SEC-B", monthly_budget_krw=10000000)
        db_session.add(t_b)
    db_session.commit()

    # Super Admin
    sa = User(
        username="sec-super-admin",
        full_name="최고보안관리자",
        email="sec-super@ordinatio.local",
        password_hash=hash_password("SuperSecret123!"),
        role="SUPER_ADMIN",
        is_active=True
    )
    db_session.add(sa)

    # Department A Tenant Admin
    ta = User(
        username="sec-dept-a-admin",
        full_name="A부서관리자",
        email="sec-dept-a@ordinatio.local",
        password_hash=hash_password("DeptAdmin123!"),
        role="TENANT_ADMIN",
        tenant_id="tenant-sec-a",
        is_active=True
    )
    db_session.add(ta)

    # Department B User
    tb = User(
        username="sec-dept-b-user",
        full_name="B부서일반사용자",
        email="sec-dept-b@ordinatio.local",
        password_hash=hash_password("DeptBUser123!"),
        role="VIEWER",
        tenant_id="tenant-sec-b",
        is_active=True
    )
    db_session.add(tb)

    # Custom Operator (has users:write, but NOT SUPER_ADMIN)
    op_role = Role(
        name="USER_OPERATOR",
        display_name="계정운영자",
        description="사용자 생성 및 수정 권한만 가진 계정운영자",
        is_system=False,
        permissions=["overview:read", "users:read", "users:write"]
    )
    db_session.add(op_role)
    db_session.commit()

    op_user = User(
        username="sec-custom-op",
        full_name="일반운영자",
        email="sec-op@ordinatio.local",
        password_hash=hash_password("OperatorPass123!"),
        role="USER_OPERATOR",
        tenant_id="tenant-sec-a",
        is_active=True
    )
    db_session.add(op_user)
    db_session.commit()

    return {
        "sa": sa,
        "ta": ta,
        "tb": tb,
        "op": op_user
    }


def test_scenario_1_privilege_escalation_blocked(client: TestClient, setup_tenants_and_admin, db_session: Session):
    """
    [실패할 만한 시나리오 1: 권한 승격(Privilege Escalation) 차단 검증]
    users:write 권한만 가진 비-슈퍼관리자(sec-custom-op)가
    1) 신규 사용자를 SUPER_ADMIN 역할로 생성하려 하거나,
    2) 기존 사용자(또는 본인)의 역할을 SUPER_ADMIN으로 변경하려 할 때 403 Forbidden으로 거부되어야 함.
    """
    # 1. sec-custom-op 로그인
    login_op = client.post("/api/v1/auth/login", json={"username": "sec-custom-op", "password": "OperatorPass123!"})
    assert login_op.status_code == 200
    op_headers = {"Authorization": f"Bearer {login_op.json()['access_token']}"}

    # 1-1. 비-슈퍼관리자가 SUPER_ADMIN 계정 생성 시도 -> 403 Forbidden 기대
    res_create = client.post("/api/v1/users", json={
        "username": "hacker-super-admin",
        "full_name": "해킹된슈퍼어드민",
        "email": "hacker@ordinatio.local",
        "password": "HackerPassword123!",
        "role": "SUPER_ADMIN"
    }, headers=op_headers)
    assert res_create.status_code == 403, f"비-슈퍼관리자의 SUPER_ADMIN 생성이 허용됨! (Status: {res_create.status_code})"

    # 1-2. 비-슈퍼관리자가 본인 계정을 SUPER_ADMIN으로 승격 시도 -> 403 Forbidden 기대
    op_user_id = setup_tenants_and_admin["op"].id
    res_patch = client.patch(f"/api/v1/users/{op_user_id}", json={
        "role": "SUPER_ADMIN"
    }, headers=op_headers)
    assert res_patch.status_code == 403, f"비-슈퍼관리자의 SUPER_ADMIN 역할 자가 승격이 허용됨! (Status: {res_patch.status_code})"


def test_scenario_2_system_role_tampering_blocked(client: TestClient, setup_tenants_and_admin):
    """
    [실패할 만한 시나리오 2: 시스템 불변 역할(is_system=True) 권한 무력화 변조 시도 차단]
    시스템 기본 필수 역할인 SUPER_ADMIN이나 TENANT_ADMIN의 권한을
    PATCH /api/v1/roles/SUPER_ADMIN 으로 빈 배열([])로 축소하거나 이름을 변조하려 할 때
    시스템 보호를 위해 400 Bad Request로 거부되어야 함.
    """
    login_sa = client.post("/api/v1/auth/login", json={"username": "sec-super-admin", "password": "SuperSecret123!"})
    sa_headers = {"Authorization": f"Bearer {login_sa.json()['access_token']}"}

    # SUPER_ADMIN의 권한을 빈 배열([])로 업데이트 시도
    res_tamper = client.patch("/api/v1/roles/SUPER_ADMIN", json={
        "display_name": "무력화된슈퍼관리자",
        "permissions": []
    }, headers=sa_headers)
    assert res_tamper.status_code == 400, f"시스템 기본 역할(SUPER_ADMIN)의 권한 축소/변조가 허용됨! (Status: {res_tamper.status_code})"


def test_scenario_3_sole_super_admin_self_deactivation_blocked(client: TestClient, setup_tenants_and_admin):
    """
    [실패할 만한 시나리오 3: 유일한 슈퍼 관리자 본인의 비활성화 DoS 방어]
    시스템 내 유일한 활성 SUPER_ADMIN이 자기 자신을 is_active=False로 비활성화하여
    시스템 전체가 관리자 고아(Orphaned Admin DoS) 상태가 되는 것을 400 Bad Request로 방어해야 함.
    """
    login_sa = client.post("/api/v1/auth/login", json={"username": "sec-super-admin", "password": "SuperSecret123!"})
    sa_headers = {"Authorization": f"Bearer {login_sa.json()['access_token']}"}
    sa_user_id = setup_tenants_and_admin["sa"].id

    res_deactivate = client.patch(f"/api/v1/users/{sa_user_id}", json={
        "is_active": False
    }, headers=sa_headers)
    assert res_deactivate.status_code == 400, f"유일한 슈퍼 관리자의 자기 비활성화가 허용됨! (Status: {res_deactivate.status_code})"


def test_scenario_4_account_lockout_strict_blocking_with_valid_password(client: TestClient, setup_tenants_and_admin, db_session: Session):
    """
    [실패할 만한 시나리오 4: 계정 잠금 상태에서 올바른 패스워드 제출 시에도 철저한 차단]
    5회 오류로 locked_until이 미래로 설정된 계정은 올바른 비밀번호를 넣더라도 403 Forbidden으로 차단되어야 함.
    """
    user = setup_tenants_and_admin["tb"]
    user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=15)
    db_session.commit()

    # 올바른 비밀번호(DeptBUser123!) 제출 시도
    login_res = client.post("/api/v1/auth/login", json={"username": "sec-dept-b-user", "password": "DeptBUser123!"})
    assert login_res.status_code == 403, f"계정 잠금 상태인데 올바른 비밀번호로 로그인이 허용됨! (Status: {login_res.status_code})"
    assert "계정이 잠겨 있습니다" in login_res.json()["detail"]


def test_scenario_5_cross_tenant_user_modification_blocked(client: TestClient, setup_tenants_and_admin):
    """
    [실패할 만한 시나리오 5: 테넌트 관리자의 타 부서 사용자 임의 변경 및 삭제 차단]
    A부서 관리자(sec-dept-a-admin)가 B부서 사용자(sec-dept-b-user)의 비밀번호를 재설정하거나
    계정을 임의 삭제하려 할 때 403 Forbidden으로 차단되어야 함.
    """
    login_ta = client.post("/api/v1/auth/login", json={"username": "sec-dept-a-admin", "password": "DeptAdmin123!"})
    ta_headers = {"Authorization": f"Bearer {login_ta.json()['access_token']}"}
    tb_user_id = setup_tenants_and_admin["tb"].id

    # 1. 타 부서 사용자 비밀번호 임의 변경 시도
    res_mod = client.patch(f"/api/v1/users/{tb_user_id}", json={
        "password": "HackedPassword123!"
    }, headers=ta_headers)
    assert res_mod.status_code == 403, f"A부서 관리자가 B부서 사용자의 비밀번호 변경에 성공함! (Status: {res_mod.status_code})"

    # 2. 타 부서 사용자 삭제 시도
    res_del = client.delete(f"/api/v1/users/{tb_user_id}", headers=ta_headers)
    assert res_del.status_code == 403, f"A부서 관리자가 B부서 사용자의 계정 삭제에 성공함! (Status: {res_del.status_code})"


def test_scenario_6_user_creation_with_empty_or_whitespace_tenant_id_sanitized(client: TestClient, setup_tenants_and_admin, db_session: Session):
    """
    [실패할 만한 시나리오 6: tenant_id가 빈 문자열('') 또는 공백일 때 ForeignKeyViolation 500 에러 방지 및 정규화]
    프론트엔드 모달에서 부서 미선택 또는 전사 역할 생성 시 tenant_id="" 가 전달될 때
    DB 외래키 제약조건(users_tenant_id_fkey) 위반 500 에러가 발생하지 않고,
    None(NULL)으로 안전하게 정규화되어 201 Created로 사용자 생성이 완료되어야 함.
    """
    login_sa = client.post("/api/v1/auth/login", json={"username": "sec-super-admin", "password": "SuperSecret123!"})
    sa_headers = {"Authorization": f"Bearer {login_sa.json()['access_token']}"}

    # 1. tenant_id="" (빈 문자열)으로 사용자 생성
    res_empty = client.post("/api/v1/users", json={
        "username": "sec-user-empty-tenant",
        "full_name": "무소속사용자1",
        "email": "empty-tenant@ordinatio.local",
        "role": "VIEWER",
        "tenant_id": "",
        "password": "Password123!"
    }, headers=sa_headers)

    assert res_empty.status_code == 201, f"tenant_id='' 전달 시 201이 아닌 에러 반환: {res_empty.status_code} - {res_empty.text}"
    user_data = res_empty.json()
    assert user_data["tenant_id"] is None, f"tenant_id가 None으로 정규화되지 않음: {user_data['tenant_id']}"

    # 2. tenant_id="   " (공백 문자열)으로 사용자 생성
    res_space = client.post("/api/v1/users", json={
        "username": "sec-user-space-tenant",
        "full_name": "무소속사용자2",
        "email": "space-tenant@ordinatio.local",
        "role": "VIEWER",
        "tenant_id": "   ",
        "password": "Password123!"
    }, headers=sa_headers)

    assert res_space.status_code == 201, f"tenant_id='   ' 전달 시 201이 아닌 에러 반환: {res_space.status_code} - {res_space.text}"
    assert res_space.json()["tenant_id"] is None

    # 3. 잘못된(존재하지 않는) 테넌트 ID 전달 시에는 400 Bad Request
    res_invalid = client.post("/api/v1/users", json={
        "username": "sec-user-invalid-tenant",
        "full_name": "잘못된테넌트사용자",
        "email": "invalid-tenant@ordinatio.local",
        "role": "VIEWER",
        "tenant_id": "non-existent-tenant-id",
        "password": "Password123!"
    }, headers=sa_headers)

    assert res_invalid.status_code == 400, f"존재하지 않는 테넌트 ID인데 400이 아님: {res_invalid.status_code}"

    # 클린업
    db_session.query(User).filter(User.username.in_(["sec-user-empty-tenant", "sec-user-space-tenant"])).delete()
    db_session.commit()
