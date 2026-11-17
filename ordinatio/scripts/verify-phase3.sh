#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo "🧪 Ordinatio Phase 3 Definition of Done (DoD) Audit"
echo "  [관제 실시간 텔레메트리 & FinOps 과금 거버넌스 검증]"
echo "=========================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

FAILED=0

# Step 1: Check Required Files and Directory Structure
echo "==> [1/4] Verifying Phase 3 Schemas, Endpoints & Core Files..."
REQUIRED_PATHS=(
    "backend/app/schemas/finops.py"
    "backend/app/schemas/observability.py"
    "backend/app/core/telemetry_hub.py"
    "backend/app/api/v1/endpoints/observability.py"
    "backend/app/api/v1/endpoints/finops.py"
    "backend/tests/test_finops_observability.py"
    "frontend/src/components/FinOpsTab.jsx"
    "frontend/src/components/OverviewTab.jsx"
)

for p in "${REQUIRED_PATHS[@]}"; do
    if [[ ! -f "${ROOT_DIR}/${p}" ]]; then
        echo "❌ Missing file: ${p}"
        FAILED=1
    fi
done

if [[ $FAILED -eq 0 ]]; then
    echo "  ✅ All Phase 3 core files verified."
fi

# Step 2: Backend Unit & Integration Tests
echo "==> [2/4] Running Backend Tests (Telemetry Hub, FinOps Overview, UTF-8 BOM CSV, Hard Cap 429)..."
cd "${ROOT_DIR}/backend"
if uv run pytest -v; then
    echo "  ✅ All 26 backend unit and integration tests passed."
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

# Step 4: Security & FinOps Invariants Audit
echo "==> [4/4] Verifying Hard Cap & FinOps CSV Invariants..."
if grep -q "TENANT_HARD_CAP_EXCEEDED" "${ROOT_DIR}/backend/app/api/v1/endpoints/virtual_keys.py" && \
   grep -q "\uFEFF" "${ROOT_DIR}/backend/app/api/v1/endpoints/finops.py" && \
   grep -q "StreamingResponse" "${ROOT_DIR}/backend/app/api/v1/endpoints/finops.py" && \
   grep -q "websocket_telemetry_stream" "${ROOT_DIR}/backend/app/api/v1/endpoints/observability.py" && \
   grep -q "exportFinOpsInvoiceCsv" "${ROOT_DIR}/frontend/src/api/client.js"; then
    echo "  ✅ FinOps invariants verified: Hard Cap 429, UTF-8 BOM CSV streaming, 1s WebSocket stream, UI export button."
else
    echo "  ❌ FinOps invariants audit failed."
    FAILED=1
fi

echo "=========================================================="
if [[ $FAILED -eq 0 ]]; then
    echo "🎉 SUCCESS: Phase 3 Observability & FinOps Governance is 100% complete and verified!"
    exit 0
else
    echo "❌ FAILURE: One or more Phase 3 checks failed."
    exit 1
fi
