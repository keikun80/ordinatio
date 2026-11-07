"""
RBAC 시나리오 공용 유틸리티 (테스트 페르소나/테넌트 프로비저닝 및 정리)

- 부트스트랩 관리자 자격증명은 하드코딩하지 않고 환경변수 또는 aiorche/.env 의
  INITIAL_ADMIN_USERNAME / INITIAL_ADMIN_PASSWORD 에서 읽습니다.
- 테스트 사용자 비밀번호는 실행 시마다 무작위 생성됩니다 (RBAC_TEST_PASSWORD 로 지정 가능).
"""
import os
import secrets
from pathlib import Path
from typing import Dict, Optional

import httpx

AIORCHE_DIR = Path(__file__).resolve().parents[2]
BASE_URL = os.environ.get("RBAC_BASE_URL", "http://localhost:8000").rstrip("/")
UI_URL = os.environ.get("RBAC_UI_URL", "http://localhost:5173").rstrip("/")

TENANT_A = {"name": "RBAC 시나리오 A부서", "department_code": "RBAC_A", "monthly_budget_krw": 1000000, "is_hard_cap_enabled": False}
TENANT_B = {"name": "RBAC 시나리오 B부서", "department_code": "RBAC_B", "monthly_budget_krw": 1000000, "is_hard_cap_enabled": False}

CUSTOM_ROLE = {
    "name": "RBAC_AUDITOR",
    "display_name": "RBAC 시나리오 감사관",
    "description": "RBAC 시나리오 테스트용 커스텀 역할 (compliance:read, users:read)",
    "permissions": ["compliance:read", "users:read"],
}

# persona key -> (username, role, tenant key)
PERSONAS = {
    "super": ("rbac-super", "SUPER_ADMIN", None),
    "tadmin": ("rbac-tadmin-a", "TENANT_ADMIN", "A"),
    "viewer": ("rbac-viewer-a", "VIEWER", "A"),
    "auditor": ("rbac-auditor", "RBAC_AUDITOR", "A"),
}


def _read_dotenv(path: Path) -> Dict[str, str]:
    data: Dict[str, str] = {}
    if not path.exists():
        return data
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        data[k.strip()] = v.strip().strip('"').strip("'")
    return data


def bootstrap_admin_credentials() -> Dict[str, str]:
    env = _read_dotenv(AIORCHE_DIR / ".env")
    user = os.environ.get("RBAC_ADMIN_USERNAME") or env.get("INITIAL_ADMIN_USERNAME")
    pw = os.environ.get("RBAC_ADMIN_PASSWORD") or env.get("INITIAL_ADMIN_PASSWORD")
    if not user or not pw:
        raise SystemExit("부트스트랩 관리자 자격증명이 없습니다. RBAC_ADMIN_USERNAME/RBAC_ADMIN_PASSWORD 또는 aiorche/.env 를 설정하십시오.")
    return {"username": user, "password": pw}


def test_password() -> str:
    return os.environ.get("RBAC_TEST_PASSWORD") or f"Rbac!{secrets.token_urlsafe(10)}"


def login(client: httpx.Client, username: str, password: str) -> str:
    res = client.post(f"{BASE_URL}/api/v1/auth/login", json={"username": username, "password": password})
    # 로그인 응답의 access_token 쿠키가 클라이언트에 보관되면 이후 '비인증' 요청이 오염되므로 즉시 제거
    client.cookies.clear()
    if res.status_code != 200:
        raise RuntimeError(f"로그인 실패 ({username}): HTTP {res.status_code} {res.text[:200]}")
    return res.json()["access_token"]


def auth(token: str, extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    h = {"Authorization": f"Bearer {token}"}
    if extra:
        h.update(extra)
    return h


def teardown(client: httpx.Client, admin_token: str) -> None:
    """이전 실행 잔여물을 포함하여 rbac- 접두 리소스를 정리 (멱등)."""
    h = auth(admin_token)
    users = client.get(f"{BASE_URL}/api/v1/users", headers=h).json()
    for u in users if isinstance(users, list) else []:
        if u["username"].startswith("rbac-"):
            client.delete(f"{BASE_URL}/api/v1/users/{u['id']}", headers=h)

    client.delete(f"{BASE_URL}/api/v1/roles/{CUSTOM_ROLE['name']}", headers=h)

    tenants = client.get(f"{BASE_URL}/api/v1/tenants", headers=h).json()
    for t in tenants if isinstance(tenants, list) else []:
        if t["department_code"].startswith("RBAC_"):
            keys = client.get(f"{BASE_URL}/api/v1/virtual-keys", params={"tenant_id": t["tenant_id"]}, headers=h).json()
            for k in keys if isinstance(keys, list) else []:
                client.delete(f"{BASE_URL}/api/v1/virtual-keys/{k['key_id']}", params={"force": "true"}, headers=h)
            client.delete(f"{BASE_URL}/api/v1/tenants/{t['tenant_id']}", headers=h)


def provision(client: httpx.Client, admin_token: str, password: str) -> Dict:
    """테넌트 A/B, 커스텀 역할, 4종 페르소나, 테넌트별 가상키 1개씩 생성."""
    h = auth(admin_token)
    state: Dict = {"tenants": {}, "users": {}, "keys": {}, "password": password}

    for key, payload in (("A", TENANT_A), ("B", TENANT_B)):
        res = client.post(f"{BASE_URL}/api/v1/tenants", json=payload, headers=h)
        res.raise_for_status()
        state["tenants"][key] = res.json()["tenant_id"]

    res = client.post(f"{BASE_URL}/api/v1/roles", json=CUSTOM_ROLE, headers=h)
    res.raise_for_status()

    for pkey, (username, role, tkey) in PERSONAS.items():
        body = {
            "username": username,
            "password": password,
            "full_name": f"RBAC {role}",
            "email": f"{username}@rbac.aiorche.local",
            "role": role,
            "tenant_id": state["tenants"][tkey] if tkey else None,
        }
        res = client.post(f"{BASE_URL}/api/v1/users", json=body, headers=h)
        res.raise_for_status()
        state["users"][pkey] = {"username": username, "role": role, "id": res.json()["id"],
                                "tenant_id": body["tenant_id"]}

    for tkey in ("A", "B"):
        res = client.post(
            f"{BASE_URL}/api/v1/virtual-keys",
            json={"name": f"rbac-key-{tkey}", "tenant_id": state["tenants"][tkey],
                  "allowed_models": [], "allowed_ip_cidrs": [], "rpm_limit": 10, "tpm_limit": 1000},
            headers=h,
        )
        res.raise_for_status()
        state["keys"][tkey] = res.json()["key_id"]
    return state
