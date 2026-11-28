#!/usr/bin/env bash
# ==============================================================================
# [Guest] 폐쇄망 상태에서 서명된 릴리스 번들 검증 → 압축 해제 → install.sh 설치
#
# 사용법: sudo bash airgap-install.sh <릴리스 디렉토리> <관리자 비밀번호>
#   <릴리스 디렉토리>: release-appliance.sh 산출물 (dist/release/v<VER>)
# ==============================================================================
set -euo pipefail

RELEASE_SRC="${1:?릴리스 디렉토리 경로가 필요합니다}"
ADMIN_PASSWORD="${2:?관리자 비밀번호가 필요합니다}"
MEDIA_DIR="/root/ordinatio-media"      # 반입 매체 사본 (USB 반입 시뮬레이션)
BUNDLE_PARENT="/opt/ordinatio-bundle"  # 번들 압축 해제 위치 (install.sh SOURCE_DIR)

if [[ $EUID -ne 0 ]]; then
    echo "❌ root 권한이 필요합니다." >&2
    exit 1
fi
if [ ! -d "$RELEASE_SRC" ]; then
    echo "❌ 릴리스 디렉토리를 찾을 수 없습니다: ${RELEASE_SRC}" >&2
    exit 1
fi

echo "==> [1/4] 릴리스 매체 반입 (공유 폴더 → ${MEDIA_DIR})"
rm -rf "$MEDIA_DIR"
mkdir -p "$MEDIA_DIR"
cp -a "${RELEASE_SRC}/." "$MEDIA_DIR/"
ls -la "$MEDIA_DIR"

echo "==> [2/4] 무결성(SHA-256/512) 및 벤더 RSA-4096 서명 검증"
(cd "$MEDIA_DIR" && bash verify-release.sh)

TARBALL="$(ls -1 "$MEDIA_DIR"/ordinatio-appliance-*.tar.gz | head -n 1)"
echo "==> [3/4] 번들 압축 해제: $(basename "$TARBALL") → ${BUNDLE_PARENT}"
rm -rf "$BUNDLE_PARENT"
mkdir -p "$BUNDLE_PARENT"
tar -xzf "$TARBALL" -C "$BUNDLE_PARENT"
BUNDLE_ROOT="${BUNDLE_PARENT}/ordinatio-appliance"
for f in bundle/images.tar.gz deploy/standalone/install.sh deploy/standalone/.env.template \
         deploy/standalone/docker-compose.standalone.yml deploy/standalone/ordinatio-ctl \
         deploy/envoy/envoy.yaml deploy/postgres/init.sql deploy/frontend/default.conf; do
    if [ ! -f "${BUNDLE_ROOT}/${f}" ]; then
        echo "❌ 번들에 설치 자산이 없습니다: ${f}" >&2
        exit 1
    fi
done
echo "  ✔ 번들 설치 자산 8종 확인"

echo "==> [4/4] install.sh 오프라인 무인 설치 (--skip-pull: 외부 레지스트리 접근 금지)"
bash "${BUNDLE_ROOT}/deploy/standalone/install.sh" \
    --auto-approve \
    --skip-pull \
    --admin-password "$ADMIN_PASSWORD"
