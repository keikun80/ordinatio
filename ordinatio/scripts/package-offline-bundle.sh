#!/usr/bin/env bash
# ==============================================================================
# Standalone Air-Gapped Appliance Package Builder
# Outputs: ordinatio/dist/ordinatio-appliance-v${VERSION}.tar.gz (+ .sha256)
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

VERSION="${1:-1.0.0}"
DIST_DIR="${ROOT_DIR}/dist"
STAGING_PARENT="/tmp/ordinatio-pkg-staging-$$"
APP_DIR_NAME="ordinatio-appliance"
STAGING_DIR="${STAGING_PARENT}/${APP_DIR_NAME}"
ARCHIVE_NAME="ordinatio-appliance-v${VERSION}.tar.gz"

# install.sh 기본 이미지 태그(keikun808/ordinatio-*:<APP_VERSION>)와 일치시키기 위한 애플리케이션 버전
# (단일 출처: backend/app/core/config.py 의 VERSION)
APP_VERSION="${APP_VERSION:-$(sed -nE 's/^[[:space:]]*VERSION:[[:space:]]*str[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' "${ROOT_DIR}/backend/app/core/config.py" | head -n 1)}"
if [ -z "${APP_VERSION}" ]; then
    echo "❌ [ERROR] backend/app/core/config.py 에서 VERSION 을 읽지 못했습니다 (APP_VERSION 환경변수로 지정 가능)."
    exit 1
fi
IMAGE_REPO="${IMAGE_REPO:-keikun808}"
BACKEND_RELEASE_TAG="${IMAGE_REPO}/ordinatio-backend:${APP_VERSION}"
FRONTEND_RELEASE_TAG="${IMAGE_REPO}/ordinatio-frontend:${APP_VERSION}"

echo "========================================================================"
echo "📦 Building Ordinatio Standalone Appliance Package (v${VERSION})"
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
docker build -t ordinatio-backend:prod ./backend
docker build --target prod -t ordinatio-frontend:prod ./frontend
# install.sh(systemd 경로)가 참조하는 릴리스 태그를 동일 이미지에 부여
docker tag ordinatio-backend:prod "${BACKEND_RELEASE_TAG}"
docker tag ordinatio-frontend:prod "${FRONTEND_RELEASE_TAG}"

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
echo "==> [4/6] Archiving 5 Docker images (+ release tags ${APP_VERSION}) into bundle/images.tar.gz..."
ALL_IMAGES=(
    "ordinatio-backend:prod"
    "ordinatio-frontend:prod"
    "${BACKEND_RELEASE_TAG}"
    "${FRONTEND_RELEASE_TAG}"
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

# systemd 기반 설치 경로(deploy/standalone/install.sh)용 자산
# 번들 루트가 install.sh 의 SOURCE_DIR 이 되며, 이미지는 bundle/images.tar.gz 에서 자동 로드된다.
mkdir -p "${STAGING_DIR}/deploy/standalone" "${STAGING_DIR}/deploy/frontend"
for f in install.sh uninstall.sh ordinatio-ctl .env.template docker-compose.standalone.yml \
         install.conf.example PREREQUISITES.md INSTALL_GUIDE.md; do
    cp "${ROOT_DIR}/deploy/standalone/${f}" "${STAGING_DIR}/deploy/standalone/${f}"
done
chmod +x "${STAGING_DIR}/deploy/standalone/install.sh" "${STAGING_DIR}/deploy/standalone/uninstall.sh" \
         "${STAGING_DIR}/deploy/standalone/ordinatio-ctl"
cp "${ROOT_DIR}/deploy/frontend/default.conf" "${STAGING_DIR}/deploy/frontend/default.conf"

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
echo "✅ Ordinatio Standalone Package Built Successfully!"
echo "========================================================================"
echo "  • Package Archive : ${DIST_DIR}/${ARCHIVE_NAME} (${FILE_SIZE})"
echo "  • SHA-256 Checksum: ${DIST_DIR}/${ARCHIVE_NAME}.sha256"
echo ""
echo "🚀 Target Machine Deployment Steps:"
echo "  1. Copy '${ARCHIVE_NAME}' to target server"
echo "  2. tar -xzf ${ARCHIVE_NAME}"
echo "  3. cd ${APP_DIR_NAME}"
echo "  4. make up                                   # (A) compose 퀵스타트"
echo "     또는 sudo bash deploy/standalone/install.sh -y  # (B) systemd 어플라이언스 설치"
echo "========================================================================"

