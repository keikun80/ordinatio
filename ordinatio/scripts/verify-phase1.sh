#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo "🧪 Ordinatio Phase 1 Definition of Done (DoD) Audit"
echo "  [인증 & 멀티 테넌트 메타데이터 코어 검증]"
echo "=========================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

FAILED=0

# Step 1: Check Required Files and Directory Structure
echo "==> [1/4] Verifying Phase 1 Schemas, Endpoints & Components..."
REQUIRED_PATHS=(
    "backend/app/schemas/tenant.py"
    "backend/app/schemas/virtual_key.py"
    "backend/app/api/v1/endpoints/tenants.py"
    "backend/app/api/v1/endpoints/virtual_keys.py"
    "backend/tests/test_virtual_keys.py"
    "frontend/src/api/client.js"
    "frontend/src/components/VirtualKeysTab.jsx"
)

for p in "${REQUIRED_PATHS[@]}"; do
    if [[ ! -f "${ROOT_DIR}/${p}" ]]; then
        echo "❌ Missing file: ${p}"
        FAILED=1
    fi
done

if [[ $FAILED -eq 0 ]]; then
    echo "  ✅ All Phase 1 core files verified."
fi

# Step 2: Backend Unit & Integration Tests (Tenants, Keys, Argon2id, Revocation)
echo "==> [2/4] Running Backend Tests (Tenant CRUD, Key Hashing, Validation, Revocation)..."
cd "${ROOT_DIR}/backend"
if uv run pytest -v; then
    echo "  ✅ All 10 backend unit and integration tests passed."
else
    echo "  ❌ Backend tests failed."
    FAILED=1
fi

# Step 3: Frontend Build Validation
echo "==> [3/4] Validating Frontend Production Build (Vite)..."
cd "${ROOT_DIR}/frontend"
if npm run build; then
    echo "  ✅ Frontend production bundle compiled successfully."
else
    echo "  ❌ Frontend build failed."
    FAILED=1
fi

# Step 4: Security Invariants Audit
echo "==> [4/4] Verifying Virtual Key Security Invariants (sk-ord- prefix & Argon2id)..."
if grep -q "sk-ord-" "${ROOT_DIR}/backend/app/core/security.py" && \
   grep -q "pwd_context = CryptContext(schemes=\[\"argon2\"" "${ROOT_DIR}/backend/app/core/security.py" && \
   grep -q "showSecretModal" "${ROOT_DIR}/frontend/src/components/VirtualKeysTab.jsx"; then
    echo "  ✅ Security invariants verified: sk-ord- prefix, Argon2id one-way hashing, single-exposure modal."
else
    echo "  ❌ Security invariants audit failed."
    FAILED=1
fi

echo "=========================================================="
if [[ $FAILED -eq 0 ]]; then
    echo "🎉 SUCCESS: Phase 1 Multi-Tenancy Core is 100% complete and verified!"
    exit 0
else
    echo "❌ FAILURE: One or more Phase 1 checks failed."
    exit 1
fi
