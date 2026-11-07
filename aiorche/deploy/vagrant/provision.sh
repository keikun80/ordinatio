#!/usr/bin/env bash
# ==============================================================================
# Vagrant Provisioner: System Requirements Setup & Standalone Installer Runner
# ==============================================================================

set -euo pipefail

echo "======================================================================"
echo "🔧 [Vagrant Provision] 1. System Requirements Configuration (EL 9)"
echo "======================================================================"

# 1. 패키지 설치
echo "==> 필수 유틸리티 패키지 설치..."
dnf install -y curl tar gzip jq procps-ng net-tools git openssl yum-utils

# 2. 방화벽 설정
echo "==> 방화벽(firewalld) 포트 개방..."
systemctl enable --now firewalld || true
firewall-cmd --permanent --add-port=80/tcp || true
firewall-cmd --permanent --add-port=8000/tcp || true
firewall-cmd --permanent --add-port=8080/tcp || true
firewall-cmd --permanent --add-port=9901/tcp || true
firewall-cmd --reload || true

# 3. SELinux 정책 설정
echo "==> SELinux 컨테이너 호환성 설정..."
setsebool -P container_manage_cgroup 1 2>/dev/null || true
mkdir -p /opt/aiorche/data
chcon -Rt svirt_sandbox_file_t /opt/aiorche/data 2>/dev/null || true

# 4. Docker Engine & Docker Compose 플러그인 설치
echo "==> Docker Engine & Docker Compose 플러그인 설치..."
if ! command -v docker &>/dev/null; then
    yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable --now docker
fi

echo "======================================================================"
echo "🚀 [Vagrant Provision] 2. Run Standalone Appliance Installer"
echo "======================================================================"

SOURCE_PATH="/opt/aiorche-src"
if [ ! -d "$SOURCE_PATH" ]; then
    SOURCE_PATH="/vagrant"
fi

# Standalone install.sh 실행 (Stage 4부터 Step 1~4 완결)
bash "${SOURCE_PATH}/deploy/standalone/install.sh" \
    --auto-approve \
    --source-dir "$SOURCE_PATH" \
    --admin-password "Admin123!Secure"

echo "======================================================================"
echo "✅ [Vagrant Provision] Provisioning Finished Successfully"
echo "======================================================================"

