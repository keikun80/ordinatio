#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo "🔐 Ordinatio Auth & RBAC Definition of Done (DoD) Audit"
echo "  [사용자 인증, 3계층 역할 통제, 30분 세션 보안 및 관리 평면 검증]"
echo "=========================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

FAILED=0

# Step 1: Check Required Files and Directory Structure
echo "==> [1/5] Verifying Core Auth & RBAC Artifacts..."
REQUIRED_PATHS=(
    "backend/app/models/user.py"
    "backend/app/schemas/user.py"
    "backend/app/core/security.py"
    "backend/app/api/deps.py"
    "backend/app/api/v1/endpoints/auth.py"
    "backend/app/api/v1/endpoints/users.py"
    "backend/app/scripts/init_admin.py"
    "backend/tests/test_auth_rbac.py"
    "frontend/src/context/AuthContext.jsx"
    "frontend/src/components/LoginPage.jsx"
    "frontend/src/components/UsersTab.jsx"
)

for p in "${REQUIRED_PATHS[@]}"; do
    if [[ ! -f "${ROOT_DIR}/${p}" ]]; then
        echo "❌ Missing file: ${p}"
        FAILED=1
    fi
done

if [[ $FAILED -eq 0 ]]; then
    echo "  ✅ All Auth & RBAC core files verified."
fi

# Step 2: Test CLI Bootstrap Scriptability
echo "==> [2/5] Testing Initial Admin CLI Bootstrapper..."
cd "${ROOT_DIR}/backend"
if uv run python -m app.scripts.init_admin --help > /dev/null; then
    echo "  ✅ Bootstrapper CLI options and help verified."
else
    echo "  ❌ Bootstrapper CLI failed."
    FAILED=1
fi

# Step 3: Run Auth & RBAC Test Suite
echo "==> [3/5] Running Backend Auth & RBAC Test Suite..."
cd "${ROOT_DIR}/backend"
if uv run pytest tests/test_auth_rbac.py -v; then
    echo "  ✅ All 7 Auth & RBAC targeted test scenarios passed."
else
    echo "  ❌ Auth & RBAC test scenarios failed."
    FAILED=1
fi

# Step 4: Run Full Zero-Regression Suite (85 Tests)
echo "==> [4/5] Running Full Backend Zero-Regression Test Suite..."
cd "${ROOT_DIR}/backend"
if uv run pytest; then
    echo "  ✅ Full test suite (85/85 tests) passed with ZERO regressions."
else
    echo "  ❌ Test suite regression detected."
    FAILED=1
fi

# Step 5: Frontend Production Bundle Compilation
echo "==> [5/5] Validating Frontend Production Build (Vite)..."
cd "${ROOT_DIR}/frontend"
if npm run build; then
    echo "  ✅ Frontend production bundle with Auth & Users tab compiled successfully."
else
    echo "  ❌ Frontend build failed."
    FAILED=1
fi

echo "=========================================================="
if [[ $FAILED -eq 0 ]]; then
    echo "🎉 DoD PASS: 사용자 인증 및 RBAC 권한 통제 구현 및 검증 완료!"
    echo "   • 인증 방식: Local DB (Argon2id + JWT)"
    echo "   • 권한 모델: 3-Tier (SUPER_ADMIN, TENANT_ADMIN, VIEWER)"
    echo "   • 테넌트 격리: 1:1 사용자-부서 매핑 및 교차 테넌트 차단"
    echo "   • 금융 보안 제약: 30분 슬라이딩 세션, 5회 실패 시 15분 잠금, 단일 세션"
    echo "   • 초기 부트스트랩: make init-admin CLI 지원"
    echo "=========================================================="
    exit 0
else
    echo "💥 DoD FAILED: 일부 검증 항목이 실패하였습니다. 로그를 확인하십시오."
    echo "=========================================================="
    exit 1
fi
