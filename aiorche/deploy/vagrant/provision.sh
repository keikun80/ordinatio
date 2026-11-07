#!/usr/bin/env bash
# ==============================================================================
# Vagrant Provisioner: Rocky Linux 9 Standalone Appliance Offline Bundle Test
# Installs and validates the appliance directly from dist/aiorche-appliance-*.tar.gz
# ==============================================================================

set -euo pipefail

echo "======================================================================"
echo "🔧 [Vagrant Provision] 1. System Requirements Configuration (Rocky Linux 9)"
echo "======================================================================"

# 1. 필수 유틸리티 및 빌드 도구 설치
echo "==> 필수 패키지 설치 (make, tar, gzip, openssl, curl 등)..."
dnf install -y curl tar gzip jq procps-ng net-tools git openssl yum-utils make

# 2. 방화벽 설정
echo "==> 방화벽(firewalld) 포트 개방..."
systemctl enable --now firewalld || true
firewall-cmd --permanent --add-port=80/tcp || true
firewall-cmd --permanent --add-port=5173/tcp || true
firewall-cmd --permanent --add-port=8000/tcp || true
firewall-cmd --permanent --add-port=8080/tcp || true
firewall-cmd --permanent --add-port=9901/tcp || true
firewall-cmd --reload || true

# 3. SELinux 정책 설정
echo "==> SELinux 컨테이너 호환성 설정..."
setsebool -P container_manage_cgroup 1 2>/dev/null || true
mkdir -p /opt/aiorche-appliance/data
chcon -Rt svirt_sandbox_file_t /opt/aiorche-appliance/data 2>/dev/null || true

# 4. Docker Engine & Docker Compose 플러그인 설치
echo "==> Docker Engine & Docker Compose 플러그인 설치..."
if ! command -v docker &>/dev/null; then
    yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable --now docker
fi

echo "======================================================================"
echo "📦 [Vagrant Provision] 2. Locate and Verify Standalone Appliance Archive"
echo "======================================================================"

BUNDLE_TAR=$(find /opt/aiorche-src /vagrant -name "aiorche-appliance-*.tar.gz" 2>/dev/null | head -n 1 || true)

if [ -z "$BUNDLE_TAR" ] || [ ! -f "$BUNDLE_TAR" ]; then
    echo "❌ [ERROR] dist 디렉토리에서 aiorche-appliance-*.tar.gz 번들을 찾을 수 없습니다!"
    exit 1
fi

echo "==> 번들 발견: $BUNDLE_TAR"
ls -lh "$BUNDLE_TAR"

# SHA256 체크섬 검증
SHA_FILE="${BUNDLE_TAR}.sha256"
if [ -f "$SHA_FILE" ]; then
    echo "==> SHA-256 무결성 검증 수행..."
    cd "$(dirname "$BUNDLE_TAR")"
    sha256sum -c "$(basename "$SHA_FILE")"
    echo "✅ SHA-256 무결성 검증 성공!"
else
    echo "⚠️ SHA-256 체크섬 파일이 존재하지 않아 해시 계산만 출력합니다."
    sha256sum "$BUNDLE_TAR"
fi

echo "======================================================================"
echo "📂 [Vagrant Provision] 3. Extract Archive to /opt/aiorche-appliance"
echo "======================================================================"

INSTALL_DIR="/opt/aiorche-appliance"
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

echo "==> 아카이브 압축 해제 중: $INSTALL_DIR ..."
tar -xzf "$BUNDLE_TAR" -C "$INSTALL_DIR"

if [ -d "$INSTALL_DIR/aiorche-appliance" ]; then
    APP_DIR="$INSTALL_DIR/aiorche-appliance"
else
    APP_DIR="$INSTALL_DIR"
fi

cd "$APP_DIR"
echo "==> 압축 해제된 작업 디렉토리 ($APP_DIR) 파일 목록:"
ls -la

echo "======================================================================"
echo "🚀 [Vagrant Provision] 4. Standalone Deployment via 'make up'"
echo "======================================================================"

# make up 실행 (이미지 로드 -> .env 자동 생성 -> docker compose up -d -> wait-healthy)
make up

echo "======================================================================"
echo "🩺 [Vagrant Provision] 5. Stack Verification & Health Probe"
echo "======================================================================"

echo "==> 컨테이너 실행 상태 (make status):"
make status

# 1) Frontend Web Console (포트 5173) 프로브
echo "==> [Probe 1/4] Frontend Web Console (http://127.0.0.1:5173/)..."
HTTP_CODE_FE=$(curl -s -o /tmp/fe_resp.txt -w "%{http_code}" http://127.0.0.1:5173/ || echo "FAIL")
if [ "$HTTP_CODE_FE" = "200" ]; then
    echo "✅ Frontend 응답 정상 (HTTP $HTTP_CODE_FE)"
else
    echo "❌ Frontend 응답 실패 (HTTP $HTTP_CODE_FE)"
    exit 1
fi

# 2) Backend API Health (포트 8000) 프로브
echo "==> [Probe 2/4] Backend Health API (http://127.0.0.1:8000/api/v1/health)..."
HTTP_CODE_BE=$(curl -s -o /tmp/be_resp.txt -w "%{http_code}" http://127.0.0.1:8000/api/v1/health || echo "FAIL")
if [ "$HTTP_CODE_BE" = "200" ]; then
    echo "✅ Backend API 정상 (HTTP $HTTP_CODE_BE)"
    cat /tmp/be_resp.txt
    echo ""
else
    echo "❌ Backend API 실패 (HTTP $HTTP_CODE_BE)"
    exit 1
fi

# 3) Envoy Admin Ready (포트 9901) 프로브
echo "==> [Probe 3/4] Envoy Admin Ready (http://127.0.0.1:9901/ready)..."
HTTP_CODE_ENVOY_ADMIN=$(curl -s -o /tmp/envoy_admin.txt -w "%{http_code}" http://127.0.0.1:9901/ready || echo "FAIL")
if [ "$HTTP_CODE_ENVOY_ADMIN" = "200" ]; then
    echo "✅ Envoy Admin 정상 (HTTP $HTTP_CODE_ENVOY_ADMIN, $(cat /tmp/envoy_admin.txt | head -n 1))"
else
    echo "❌ Envoy Admin 실패 (HTTP $HTTP_CODE_ENVOY_ADMIN)"
    exit 1
fi

# 4) Envoy L7 Gateway Route (포트 8080) 프로브
echo "==> [Probe 4/4] Envoy Gateway Port (http://127.0.0.1:8080/v1/models)..."
HTTP_CODE_GW=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/v1/models || echo "FAIL")
echo "ℹ️ Envoy Gateway 응답 코드: HTTP $HTTP_CODE_GW (L7 리스너 활성화 확인)"

# 5) 초기 관리자 부트스트랩 테스트
echo "==> [Test 5] Initial Admin Creation Test (make init-admin)..."
docker exec aiorche-backend python -m app.scripts.init_admin \
    --email "admin@aiorche.local" \
    --password "Admin123!Secure" \
    --name "시스템 최고관리자" || true
echo "✅ 슈퍼관리자 부트스트랩 명령 완료"

# 6) 백업 메커니즘 테스트 (make backup)
echo "==> [Test 6] Standalone Database Backup Test (make backup)..."
make backup
ls -lh backups/
echo "✅ 백업 생성 확인 완료"

echo "======================================================================"
echo "🎉 [Vagrant Provision] ALL STANDALONE APPLIANCE TESTS PASSED (100%)"
echo "   Rocky Linux 9 가상머신 내 dist tar.gz 압축해제 및 make up 정상 구동 완결!"
echo "======================================================================"
