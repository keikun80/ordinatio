"""
RBAC 역할별 시나리오 테스트 명세 (API / UI 공용 Single Source of Truth)

- 본 파일의 ROLE_SPEC 은 "설계 기대값(Spec)"이며 백엔드 구현 코드를 import 하지 않습니다.
  (구현을 그대로 복사하면 구현 결함을 검출할 수 없기 때문)
- 기대값 출처: architecture 문서 + backend/app/db/init_db.py 기본 역할 정의(설계 의도)
"""
from typing import Dict, List, Optional, Set

# -----------------------------------------------------------------------------
# 1. 역할별 권한 명세 (Spec)
# -----------------------------------------------------------------------------
ALL_PERMS: List[str] = [
    "overview:read",
    "routing:read", "routing:write",
    "governance:read", "governance:write",
    "prompts:read", "prompts:write",
    "finops:read", "finops:write",
    "compliance:read", "compliance:write",
    "lifecycle:read", "lifecycle:write",
    "prompt_studio:execute",
    "users:read", "users:write",
    "roles:manage",
]

ROLE_SPEC: Dict[str, Dict] = {
    "SUPER_ADMIN": {
        "perms": set(ALL_PERMS),
        "tenant_scoped": False,
        "desc": "전사 최고관리자 (전 권한, 테넌트 무제한)",
    },
    "TENANT_ADMIN": {
        "perms": {
            "overview:read", "routing:read", "governance:read", "governance:write",
            "prompts:read", "prompts:write", "finops:read", "prompt_studio:execute",
        },
        "tenant_scoped": True,
        "desc": "부서 관리자 (소속 부서 한정 가상키/프롬프트 관리)",
    },
    "VIEWER": {
        "perms": {
            "overview:read", "routing:read", "governance:read",
            "prompts:read", "finops:read", "compliance:read", "lifecycle:read",
        },
        "tenant_scoped": True,
        "desc": "일반 조회자 (읽기 전용)",
    },
    # 동적 PBAC 검증용 커스텀 역할 (시나리오 실행 시 SUPER_ADMIN 이 생성)
    "RBAC_AUDITOR": {
        "perms": {"compliance:read", "users:read"},
        "tenant_scoped": True,
        "desc": "커스텀 보안 감사관 (PII 감사로그 + 사용자 목록 조회만)",
        "custom": True,
    },
}


def effective_perms(role: str) -> Set[str]:
    """write 권한 보유 시 동일 영역 read 권한을 암묵 부여 (설계 규칙)."""
    perms = set(ROLE_SPEC[role]["perms"])
    for p in list(perms):
        if p.endswith(":write"):
            perms.add(p.replace(":write", ":read"))
    if "roles:manage" in perms:
        perms.add("users:read")
    return perms


def is_allowed(role: str, perm: str) -> bool:
    return perm in effective_perms(role)


# -----------------------------------------------------------------------------
# 2. API 권한 매트릭스 (비파괴 프로브)
#    - 쓰기 API 는 빈 바디({}) 또는 존재하지 않는 ID 로 호출
#      -> 권한 없음: 403 / 권한 있음: 422(검증 실패) or 404(미존재) 등 401·403 이외
#    - FastAPI 는 의존성(권한 검사)을 바디 검증보다 먼저 수행하므로 비파괴로 인가만 검증 가능
# -----------------------------------------------------------------------------
API_MATRIX: List[Dict] = [
    # 관제 홈
    {"id": "OV-R1", "perm": "overview:read", "method": "GET", "path": "/api/v1/observability/metrics/summary"},
    # 모델 & 라우팅
    {"id": "RT-R1", "perm": "routing:read", "method": "GET", "path": "/api/v1/models"},
    {"id": "RT-R2", "perm": "routing:read", "method": "GET", "path": "/api/v1/routing/history"},
    {"id": "RT-R3", "perm": "routing:read", "method": "GET", "path": "/api/v1/routing/agent-router/policies"},
    {"id": "RT-W1", "perm": "routing:write", "method": "POST", "path": "/api/v1/models", "json": {}},
    {"id": "RT-W2", "perm": "routing:write", "method": "PATCH", "path": "/api/v1/models/rbac-probe-nonexistent-model", "json": {}},
    {"id": "RT-W3", "perm": "routing:write", "method": "DELETE", "path": "/api/v1/models/rbac-probe-nonexistent-model"},
    # 거버넌스
    {"id": "GV-R1", "perm": "governance:read", "method": "GET", "path": "/api/v1/tenants"},
    {"id": "GV-R2", "perm": "governance:read", "method": "GET", "path": "/api/v1/virtual-keys"},
    {"id": "GV-W1", "perm": "governance:write", "method": "PATCH", "path": "/api/v1/virtual-keys/vk-rbac-probe-nonexistent", "json": {}},
    {"id": "GV-W2", "perm": "governance:write", "method": "DELETE", "path": "/api/v1/virtual-keys/vk-rbac-probe-nonexistent"},
    # 시스템 프롬프트
    {"id": "SP-R1", "perm": "prompts:read", "method": "GET", "path": "/api/v1/system-prompts"},
    {"id": "SP-W1", "perm": "prompts:write", "method": "POST", "path": "/api/v1/system-prompts", "json": {}},
    {"id": "SP-W2", "perm": "prompts:write", "method": "DELETE", "path": "/api/v1/system-prompts/sp-rbac-probe-nonexistent"},
    # FinOps
    {"id": "FO-R1", "perm": "finops:read", "method": "GET", "path": "/api/v1/finops/overview"},
    {"id": "FO-W1", "perm": "finops:write", "method": "GET", "path": "/api/v1/finops/invoices/export"},
    # 컴플라이언스
    {"id": "CP-R1", "perm": "compliance:read", "method": "GET", "path": "/api/v1/compliance/rules"},
    {"id": "CP-R2", "perm": "compliance:read", "method": "GET", "path": "/api/v1/compliance/audit-logs"},
    {"id": "CP-W1", "perm": "compliance:write", "method": "POST", "path": "/api/v1/compliance/rules", "json": {}},
    {"id": "CP-W2", "perm": "compliance:write", "method": "DELETE", "path": "/api/v1/compliance/rules/pii-rbac-probe-nonexistent"},
    # 수명주기
    {"id": "LC-R1", "perm": "lifecycle:read", "method": "GET", "path": "/api/v1/lifecycle/components"},
    {"id": "LC-R2", "perm": "lifecycle:read", "method": "GET", "path": "/api/v1/lifecycle/patches/history"},
    {"id": "LC-W1", "perm": "lifecycle:write", "method": "POST", "path": "/api/v1/lifecycle/patches/verify", "json": {}},
    {"id": "LC-W2", "perm": "lifecycle:write", "method": "POST", "path": "/api/v1/lifecycle/patches/dry-run", "json": {}},
    # 계정/역할
    {"id": "US-R1", "perm": "users:read", "method": "GET", "path": "/api/v1/users"},
    {"id": "US-R2", "perm": "users:read", "method": "GET", "path": "/api/v1/roles"},
    {"id": "US-W1", "perm": "users:write", "method": "POST", "path": "/api/v1/users", "json": {}},
    {"id": "US-W2", "perm": "users:write", "method": "DELETE", "path": "/api/v1/users/00000000-0000-0000-0000-000000000000"},
    {"id": "RL-M1", "perm": "roles:manage", "method": "POST", "path": "/api/v1/roles", "json": {}},
    # 프롬프트 스튜디오 (콘솔 JWT 로 게이트웨이 추론 호출)
    {
        "id": "PS-X1", "perm": "prompt_studio:execute", "method": "POST", "path": "/v1/chat/completions",
        "headers": {"X-Console-Prompt-Studio": "true"},
        "json": {"model": "agent-auto", "messages": [{"role": "user", "content": "RBAC 권한 프로브"}], "max_tokens": 8},
    },
]


# -----------------------------------------------------------------------------
# 3. UI 명세 (사이드바 메뉴 노출 / 조회전용 배지 / 쓰기 버튼 비활성)
# -----------------------------------------------------------------------------
UI_TABS: List[Dict] = [
    {"tab": "overview", "read": "overview:read"},
    {"tab": "routing", "read": "routing:read"},
    {"tab": "virtual-keys", "read": "governance:read", "write": "governance:write", "write_button": "vk-btn-open-create"},
    {"tab": "system-prompts", "read": "prompts:read", "write": "prompts:write", "write_button": "sp-btn-open-create"},
    {"tab": "finops", "read": "finops:read", "write": "finops:write"},
    {"tab": "compliance", "read": "compliance:read", "write": "compliance:write"},
    {"tab": "prompt-studio", "read": "prompt_studio:execute"},
    {"tab": "users", "read": "users:read", "write": "users:write", "write_button": "users-btn-create-modal"},
    {"tab": "roles", "read": "roles:manage"},
]

READ_ONLY_BADGE_TEXT = "조회 전용 권한"


def expected_visible_tabs(role: str) -> List[str]:
    return [t["tab"] for t in UI_TABS if is_allowed(role, t["read"])]


def expected_write_enabled(role: str, tab: Dict) -> Optional[bool]:
    if "write" not in tab:
        return None
    return is_allowed(role, tab["write"])

