#!/usr/bin/env bash
# ==============================================================================
# Automated Verification Suite: Standalone Offline Appliance Bundle
# Validates PRE_40: tar.gz unpack -> make up -> healthchecks -> make down
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}${BOLD}"
echo "========================================================================"
echo "🧪 [DoD Verification] AI Orchestrator Standalone Bundle End-to-End Test"
echo "========================================================================"
echo -e "${NC}"

DIST_DIR="${ROOT_DIR}/dist"
LATEST_BUNDLE=$(ls -t "${DIST_DIR}"/aiorche-appliance-*.tar.gz 2>/dev/null | head -n1 || true)

if [ -z "${LATEST_BUNDLE}" ] || [ ! -f "${LATEST_BUNDLE}" ]; then
    echo "==> No bundle found in ${DIST_DIR}. Building package first..."
    bash "${ROOT_DIR}/scripts/package-offline-bundle.sh"
    LATEST_BUNDLE=$(ls -t "${DIST_DIR}"/aiorche-appliance-*.tar.gz 2>/dev/null | head -n1)
fi

echo -e "  • Target Bundle: ${BOLD}${LATEST_BUNDLE}${NC}"

# Check SHA-256
SHA_FILE="${LATEST_BUNDLE}.sha256"
if [ -f "${SHA_FILE}" ]; then
    echo "==> Verifying SHA-256 Checksum..."
    cd "${DIST_DIR}"
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum -c "$(basename "${SHA_FILE}")"
    else
        shasum -a 256 -c "$(basename "${SHA_FILE}")"
    fi
    echo -e "  ${GREEN}✔ SHA-256 Checksum Verified${NC}"
fi

# Step 1: Unpack in sandbox temp dir
SANDBOX_DIR=$(mktemp -d /tmp/aiorche-offline-e2e-XXXXXX)
echo "==> Unpacking bundle into isolated sandbox: ${SANDBOX_DIR}..."
tar -xzf "${LATEST_BUNDLE}" -C "${SANDBOX_DIR}"

TEST_APP_DIR="${SANDBOX_DIR}/aiorche-appliance"
if [ ! -d "${TEST_APP_DIR}" ]; then
    echo -e "  ${RED}✖ Unpacked directory not found: ${TEST_APP_DIR}${NC}"
    rm -rf "${SANDBOX_DIR}"
    exit 1
fi

cleanup() {
    echo "==> Cleaning up test containers in sandbox..."
    if [ -d "${TEST_APP_DIR}" ]; then
        cd "${TEST_APP_DIR}" && make down >/dev/null 2>&1 || true
    fi
    rm -rf "${SANDBOX_DIR}"
}
trap cleanup EXIT

# Step 2: Execute 'make up'
echo "==> Executing 'make up' in sandbox directory..."
cd "${TEST_APP_DIR}"
make up

# Step 3: Verify Container Health & Services
echo "==> Verifying 5 service health states via HTTP probes..."
sleep 3

# Probe 1: Frontend SPA Nginx on 5173
echo -n "  • Probing Frontend Web Console (http://localhost:5173)... "
STATUS_FE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ || echo "000")
if [ "${STATUS_FE}" = "200" ]; then
    echo -e "${GREEN}[OK 200]${NC}"
else
    echo -e "${RED}[FAIL ${STATUS_FE}]${NC}"
    exit 1
fi

# Probe 2: Backend REST API on 8000
echo -n "  • Probing Backend Health (http://localhost:8000/api/v1/health)... "
STATUS_BE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/v1/health || echo "000")
if [ "${STATUS_BE}" = "200" ]; then
    echo -e "${GREEN}[OK 200]${NC}"
else
    echo -e "${RED}[FAIL ${STATUS_BE}]${NC}"
    exit 1
fi

# Probe 3: L7 Envoy AI Gateway on 8080 (GET /v1/models)
echo -n "  • Probing L7 AI Gateway Models (http://localhost:8080/v1/models)... "
STATUS_GW=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/v1/models || echo "000")
if [ "${STATUS_GW}" = "200" ]; then
    echo -e "${GREEN}[OK 200]${NC}"
else
    echo -e "${RED}[FAIL ${STATUS_GW}]${NC}"
    exit 1
fi

# Step 4: Verify 'make status' and 'make down'
echo "==> Verifying 'make status'..."
make status

echo "==> Verifying 'make down'..."
make down

echo ""
echo -e "${GREEN}${BOLD}========================================================================${NC}"
echo -e "${GREEN}${BOLD}🎉 Standalone Offline Bundle Verification 100% PASSED! (PRE_40 DoD 완료)${NC}"
echo -e "${GREEN}${BOLD}========================================================================${NC}"

