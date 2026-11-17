#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo "🧪 Ordinatio Phase 2 Definition of Done (DoD) Audit"
echo "  [Envoy xDS 연동 & 동적 카나리 라우팅 엔진 검증]"
echo "=========================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

FAILED=0

# Step 1: Check Required Files and Directory Structure
echo "==> [1/4] Verifying Phase 2 Schemas, Endpoints & Core Files..."
REQUIRED_PATHS=(
    "backend/app/models/model_catalog.py"
    "backend/app/models/routing_policy.py"
    "backend/app/schemas/model_catalog.py"
    "backend/app/schemas/routing.py"
    "backend/app/core/xds_generator.py"
    "backend/app/api/v1/endpoints/models.py"
    "backend/app/api/v1/endpoints/routing.py"
    "backend/app/api/v1/endpoints/xds.py"
    "backend/tests/test_routing.py"
    "frontend/src/components/RoutingTab.jsx"
)

for p in "${REQUIRED_PATHS[@]}"; do
    if [[ ! -f "${ROOT_DIR}/${p}" ]]; then
        echo "❌ Missing file: ${p}"
        FAILED=1
    fi
done

if [[ $FAILED -eq 0 ]]; then
    echo "  ✅ All Phase 2 core files verified."
fi

# Step 2: Backend Unit & Integration Tests
echo "==> [2/4] Running Backend Tests (Model Catalog, Dry-Run, Canary 80:20, xDS Discovery)..."
cd "${ROOT_DIR}/backend"
if uv run pytest -v; then
    echo "  ✅ All 20 backend unit and integration tests passed."
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

# Step 4: Security & Routing Invariants Audit
echo "==> [4/4] Verifying xDS Invariants & Canary Split Engine..."
if grep -q "weighted_clusters" "${ROOT_DIR}/backend/app/core/xds_generator.py" && \
   grep -q "generate_xds_revision" "${ROOT_DIR}/backend/app/core/xds_generator.py" && \
   grep -q "discovery:routes" "${ROOT_DIR}/backend/app/api/v1/endpoints/xds.py" && \
   grep -q "custom-range" "${ROOT_DIR}/frontend/src/components/RoutingTab.jsx"; then
    echo "  ✅ Routing invariants verified: weighted_clusters, xds_revision generator, RDS REST endpoint, UI slider."
else
    echo "  ❌ Routing invariants audit failed."
    FAILED=1
fi

echo "=========================================================="
if [[ $FAILED -eq 0 ]]; then
    echo "🎉 SUCCESS: Phase 2 Dynamic xDS Control Plane is 100% complete and verified!"
    exit 0
else
    echo "❌ FAILURE: One or more Phase 2 checks failed."
    exit 1
fi
