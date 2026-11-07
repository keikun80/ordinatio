#!/usr/bin/env bash
# ==============================================================================
# Smart Offline Docker Image Loader
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

REQUIRED_IMAGES=(
    "aiorche-backend:prod"
    "aiorche-frontend:prod"
    "postgres:15-alpine"
    "redis:7-alpine"
    "envoyproxy/envoy:v1.31.2"
)

ALL_PRESENT=true
for img in "${REQUIRED_IMAGES[@]}"; do
    if ! docker image inspect "${img}" >/dev/null 2>&1; then
        ALL_PRESENT=false
        break
    fi
done

if [ "${ALL_PRESENT}" = true ]; then
    echo "==> [Offline Loader] All 5 required Docker images already loaded in local daemon. (Skipping unpack)"
    exit 0
fi

BUNDLE_FILE="${APP_DIR}/bundle/images.tar.gz"
if [ ! -f "${BUNDLE_FILE}" ]; then
    echo "❌ Error: Docker image bundle '${BUNDLE_FILE}' not found."
    exit 1
fi

echo "==> [Offline Loader] Unpacking and loading 5 appliance Docker images from ${BUNDLE_FILE}..."
docker load -i "${BUNDLE_FILE}"
echo "==> [Offline Loader] All Docker images loaded successfully."

