#!/usr/bin/env bash
# ==============================================================================
# Standalone Air-Gapped Appliance Package Builder
# Outputs: aiorche/dist/aiorche-appliance-v${VERSION}.tar.gz (+ .sha256)
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

VERSION="${1:-1.0.0}"
DIST_DIR="${ROOT_DIR}/dist"
STAGING_PARENT="/tmp/aiorche-pkg-staging-$$"
APP_DIR_NAME="aiorche-appliance"
STAGING_DIR="${STAGING_PARENT}/${APP_DIR_NAME}"
ARCHIVE_NAME="aiorche-appliance-v${VERSION}.tar.gz"

echo "========================================================================"
echo "📦 Building AI Orchestrator Standalone Appliance Package (v${VERSION})"
echo "========================================================================"

mkdir -p "${DIST_DIR}"
rm -rf "${STAGING_PARENT}"
mkdir -p "${STAGING_DIR}"
mkdir -p "${STAGING_DIR}/bundle"
mkdir -p "${STAGING_DIR}/scripts"
mkdir -p "${STAGING_DIR}/deploy/envoy"
mkdir -p "${STAGING_DIR}/deploy/postgres"

# Step 1: Frontend Static Build
echo "==> [1/6] Building Production Frontend Assets..."
cd "${ROOT_DIR}/frontend"
npm run build

# Step 2: Build Application Production Docker Images
echo "==> [2/6] Building Immutable Production Docker Images..."
cd "${ROOT_DIR}"
docker build -t aiorche-backend:prod ./backend
docker build --target prod -t aiorche-frontend:prod ./frontend

# Step 3: Ensure 3rd-party Base Images Exist Locally
echo "==> [3/6] Ensuring Infrastructure Base Docker Images are Present..."
THIRD_PARTY_IMAGES=("postgres:15-alpine" "redis:7-alpine" "envoyproxy/envoy:v1.31.2")
for img in "${THIRD_PARTY_IMAGES[@]}"; do
    if ! docker image inspect "${img}" >/dev/null 2>&1; then
        echo "  • Pulling ${img}..."
        docker pull "${img}"
    fi
done

# Step 4: Archive All 5 Docker Images to Single Compressed Bundle
echo "==> [4/6] Archiving 5 Docker images into bundle/images.tar.gz..."
ALL_IMAGES=(
    "aiorche-backend:prod"
    "aiorche-frontend:prod"
    "postgres:15-alpine"
    "redis:7-alpine"
    "envoyproxy/envoy:v1.31.2"
)
docker save "${ALL_IMAGES[@]}" | gzip -c > "${STAGING_DIR}/bundle/images.tar.gz"

# Step 5: Assemble Staging Payload
echo "==> [5/6] Assembling Appliance Distribution Payload..."
TEMPLATE_DIR="${ROOT_DIR}/deploy/standalone/template"
cp "${TEMPLATE_DIR}/Makefile" "${STAGING_DIR}/Makefile"
cp "${TEMPLATE_DIR}/docker-compose.yml" "${STAGING_DIR}/docker-compose.yml"
cp "${TEMPLATE_DIR}/.env.example" "${STAGING_DIR}/.env.example"
cp "${TEMPLATE_DIR}/README.md" "${STAGING_DIR}/README.md"
cp "${TEMPLATE_DIR}/scripts/offline-load.sh" "${STAGING_DIR}/scripts/offline-load.sh"
cp "${TEMPLATE_DIR}/scripts/wait-healthy.sh" "${STAGING_DIR}/scripts/wait-healthy.sh"
chmod +x "${STAGING_DIR}/scripts/"*.sh

cp "${ROOT_DIR}/deploy/envoy/envoy.yaml" "${STAGING_DIR}/deploy/envoy/envoy.yaml"
cp "${ROOT_DIR}/deploy/postgres/init.sql" "${STAGING_DIR}/deploy/postgres/init.sql"

# Step 6: Create Final Compressed Tarball & SHA-256 Checksum
echo "==> [6/6] Generating Final Tarball and SHA-256 Checksum..."
cd "${STAGING_PARENT}"
tar -czf "${DIST_DIR}/${ARCHIVE_NAME}" "${APP_DIR_NAME}"

cd "${DIST_DIR}"
if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${ARCHIVE_NAME}" > "${ARCHIVE_NAME}.sha256"
else
    shasum -a 256 "${ARCHIVE_NAME}" > "${ARCHIVE_NAME}.sha256"
fi

rm -rf "${STAGING_PARENT}"

FILE_SIZE=$(du -h "${DIST_DIR}/${ARCHIVE_NAME}" | cut -f1)
echo ""
echo "========================================================================"
echo "✅ AI Orchestrator Standalone Package Built Successfully!"
echo "========================================================================"
echo "  • Package Archive : ${DIST_DIR}/${ARCHIVE_NAME} (${FILE_SIZE})"
echo "  • SHA-256 Checksum: ${DIST_DIR}/${ARCHIVE_NAME}.sha256"
echo ""
echo "🚀 Target Machine Deployment Steps:"
echo "  1. Copy '${ARCHIVE_NAME}' to target server"
echo "  2. tar -xzf ${ARCHIVE_NAME}"
echo "  3. cd ${APP_DIR_NAME}"
echo "  4. make up"
echo "========================================================================"

