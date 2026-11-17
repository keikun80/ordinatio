#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo "🧪 Ordinatio Phase 0 Definition of Done (DoD) Audit"
echo "=========================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

FAILED=0

# Step 1: Check Required Files and Directory Structure
echo "==> [1/5] Verifying Monorepo Scaffolding & Configuration..."
REQUIRED_PATHS=(
    "backend/pyproject.toml"
    "backend/Dockerfile"
    "backend/app/main.py"
    "backend/app/core/config.py"
    "backend/app/core/security.py"
    "backend/app/api/v1/endpoints/health.py"
    "backend/app/models/virtual_key.py"
    "frontend/package.json"
    "frontend/src/App.jsx"
    "frontend/src/api/client.js"
    "deploy/postgres/init.sql"
    "deploy/envoy/envoy.yaml"
    "docker-compose.yml"
    "Makefile"
)

for p in "${REQUIRED_PATHS[@]}"; do
    if [[ ! -f "${ROOT_DIR}/${p}" ]]; then
        echo "❌ Missing file: ${p}"
        FAILED=1
    fi
done

if [[ $FAILED -eq 0 ]]; then
    echo "  ✅ All core scaffolding files verified."
fi

# Step 2: Backend Unit Tests
echo "==> [2/5] Running Backend Unit & Security Tests (pytest)..."
cd "${ROOT_DIR}/backend"
if uv run pytest -v; then
    echo "  ✅ Backend unit tests passed (Health probes, system info, Argon2 hashing)."
else
    echo "  ❌ Backend tests failed."
    FAILED=1
fi

# Step 3: Frontend Build Validation
echo "==> [3/5] Validating Frontend Production Build..."
cd "${ROOT_DIR}/frontend"
if npm run build; then
    echo "  ✅ Frontend production bundle compiled successfully."
else
    echo "  ❌ Frontend build failed."
    FAILED=1
fi

# Step 4: Postgres DDL Validation
echo "==> [4/5] Checking Postgres DDL Schema (init.sql)..."
if grep -q "CREATE TABLE IF NOT EXISTS virtual_keys" "${ROOT_DIR}/deploy/postgres/init.sql" && \
   grep -q "CREATE TABLE IF NOT EXISTS routing_policies" "${ROOT_DIR}/deploy/postgres/init.sql"; then
    echo "  ✅ Postgres domain DDL schema verified."
else
    echo "  ❌ DDL schema missing required tables."
    FAILED=1
fi

# Step 5: Envoy AI Gateway Config Validation
echo "==> [5/5] Checking Envoy AI Gateway Config (envoy.yaml)..."
if grep -q "ai_gateway_ingress" "${ROOT_DIR}/deploy/envoy/envoy.yaml"; then
    echo "  ✅ Envoy L7 Gateway configuration verified."
else
    echo "  ❌ Envoy configuration invalid."
    FAILED=1
fi

echo "=========================================================="
if [[ $FAILED -eq 0 ]]; then
    echo "🎉 SUCCESS: Phase 0 Foundations is 100% complete and verified!"
    exit 0
else
    echo "❌ FAILURE: One or more Phase 0 checks failed."
    exit 1
fi
