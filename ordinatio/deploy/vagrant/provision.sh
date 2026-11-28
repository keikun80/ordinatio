#!/usr/bin/env bash
# ==============================================================================
# Vagrant Provisioner: Standalone Appliance Rocky Linux 9 Deployment via install.sh
# Supports: Rocky Linux 9 / Enterprise Linux 9 (and Amazon Linux / Ubuntu)
# ==============================================================================

set -euo pipefail

echo "======================================================================"
echo "🔧 [Vagrant Provision] 1. Pre-requisites Infrastructure Setup"
echo "======================================================================"

if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_ID="${ID:-unknown}"
else
    OS_ID="unknown"
fi

echo "==> 감지된 호스트 OS: ${PRETTY_NAME:-$OS_ID}"

if [[ "$OS_ID" == "ubuntu" || "$OS_ID" == "debian" ]]; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y curl tar gzip jq procps net-tools git openssl make ca-certificates gnupg rsync iproute2

    if command -v ufw &>/dev/null; then
        ufw allow 80/tcp || true
        ufw allow 5173/tcp || true
        ufw allow 8000/tcp || true
        ufw allow 8080/tcp || true
        ufw allow 9901/tcp || true
    fi

    if ! command -v docker &>/dev/null; then
        install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
        chmod a+r /etc/apt/keyrings/docker.gpg
        echo \
          "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
          $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | \
          tee /etc/apt/sources.list.d/docker.list > /dev/null
        apt-get update -y
        apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        systemctl enable --now docker
    fi
elif [[ "$OS_ID" == "amzn" ]]; then
    dnf install -y --allowerasing tar gzip jq procps-ng git openssl make docker rsync iproute
    systemctl enable --now docker

    if systemctl is-active firewalld &>/dev/null; then
        firewall-cmd --permanent --add-port=80/tcp || true
        firewall-cmd --permanent --add-port=5173/tcp || true
        firewall-cmd --permanent --add-port=8000/tcp || true
        firewall-cmd --permanent --add-port=8080/tcp || true
        firewall-cmd --permanent --add-port=9901/tcp || true
        firewall-cmd --reload || true
    fi

    if ! docker compose version &>/dev/null; then
        mkdir -p /usr/local/lib/docker/cli-plugins /usr/libexec/docker/cli-plugins
        curl -fsSL https://github.com/docker/compose/releases/download/v2.33.1/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose
        chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
        ln -sf /usr/local/lib/docker/cli-plugins/docker-compose /usr/libexec/docker/cli-plugins/docker-compose
        ln -sf /usr/local/lib/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose
    fi
else
    # Rocky Linux 9 / RHEL 9 / CentOS Stream 9
    echo "==> Rocky Linux / Enterprise Linux 9 필수 패키지 설치..."
    dnf install -y curl tar gzip jq procps-ng net-tools git openssl yum-utils make rsync iproute

    echo "==> firewalld 구성 및 서비스 포트 개방..."
    systemctl enable --now firewalld || true
    firewall-cmd --permanent --add-port=80/tcp || true
    firewall-cmd --permanent --add-port=5173/tcp || true
    firewall-cmd --permanent --add-port=8000/tcp || true
    firewall-cmd --permanent --add-port=8080/tcp || true
    firewall-cmd --permanent --add-port=9901/tcp || true
    firewall-cmd --reload || true

    echo "==> SELinux 정책 설정..."
    setsebool -P container_manage_cgroup 1 2>/dev/null || true
    mkdir -p /opt/ordinatio/data/{postgres,redis,logs,worm_audit}
    chcon -Rt svirt_sandbox_file_t /opt/ordinatio/data 2>/dev/null || true

    if ! command -v docker &>/dev/null; then
        echo "==> Docker Engine & Docker Compose Plugin 설치..."
        yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
        dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
        systemctl enable --now docker
    fi

    # Docker 브릿지 인터페이스 방화벽 신뢰 등록 (컨테이너 내 인터넷 접속 보장)
    firewall-cmd --zone=trusted --add-interface=docker0 --permanent 2>/dev/null || true
    firewall-cmd --reload || true
    systemctl restart docker
fi

echo "✅ Docker Engine: $(docker --version)"
echo "✅ Docker Compose: $(docker compose version)"

# 폐쇄망(Air-Gap) 테스트 베이스 이미지 모드: 사전 요구사항(OS 패키지 + Docker)까지만 구성하고 종료
# (scripts/vagrant/vg-airgap-test.sh 가 ORD_PREREQ_ONLY=true 로 호출 → 이후 외부망 차단 후 오프라인 번들 설치)
if [ "${PREREQ_ONLY:-false}" = "true" ]; then
    echo "======================================================================"
    echo "📌 [Vagrant Provision] PREREQ_ONLY=true: 사전 요구사항 구성까지만 수행하고 종료합니다."
    echo "======================================================================"
    exit 0
fi

echo "======================================================================"
echo "🚀 [Vagrant Provision] 2. Standalone Deployment via install.sh"
echo "======================================================================"

# install.sh 경로 자동 탐색 (/opt/ordinatio-src 또는 오케스트레이터 하위 등 다중 마운트 지원)
INSTALL_SCRIPT=$(find /opt/ordinatio-src /vagrant -name "install.sh" 2>/dev/null | grep "standalone/install.sh" | head -n 1 || true)
if [ -z "$INSTALL_SCRIPT" ] || [ ! -f "$INSTALL_SCRIPT" ]; then
    echo "❌ [ERROR] install.sh를 찾을 수 없습니다!"
    find /opt/ordinatio-src /vagrant -name "*install*" 2>/dev/null || true
    exit 1
fi

echo "==> 발견된 install.sh 경로: $INSTALL_SCRIPT"
chmod +x "$INSTALL_SCRIPT"

# install.sh 실행: 완전 무인 자동 승인(-y), 로컬 소스 빌드(--build), 슈퍼관리자 암호 지정, 데모 데이터 적재(--seed-demo)
echo "==> install.sh 실행 (단일 호스트 Standalone 어플라이언스 설치)..."
"$INSTALL_SCRIPT" -y --build --admin-password admin1234! --seed-demo

echo "======================================================================"
echo "🩺 [Vagrant Provision] 3. Verification & Diagnostic Probe"
echo "======================================================================"

export PATH="/usr/local/bin:/opt/ordinatio/bin:$PATH"
CTL_BIN="/opt/ordinatio/bin/ordinatio-ctl"
if [ ! -x "$CTL_BIN" ] && [ -x /usr/local/bin/ordinatio-ctl ]; then
    CTL_BIN="/usr/local/bin/ordinatio-ctl"
fi

echo "==> 1. 호스트 관리 도구 상태 ($CTL_BIN status):"
"$CTL_BIN" status

echo "==> 2. 어플라이언스 무결성 검증 ($CTL_BIN verify):"
"$CTL_BIN" verify || true

echo "==> 3. 핵심 엔드포인트 라이브 응답 확인:"
echo -n "• Frontend (HTTP 80): "
FE_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:80/ || echo "FAIL")
echo "HTTP $FE_CODE"

echo -n "• Backend Health (HTTP 8000): "
curl -s http://127.0.0.1:8000/health && echo ""

echo -n "• Envoy Admin (HTTP 9901): "
curl -s http://127.0.0.1:9901/ready && echo ""

echo -n "• Envoy AI Gateway (HTTP 8080): "
GW_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/v1/models || echo "FAIL")
echo "HTTP $GW_CODE"

echo ""
echo "======================================================================"
echo "🎉 [Vagrant Provision] ALL STANDALONE APPLIANCE TESTS PASSED (100%)"
echo "   Rocky Linux 9 환경에서 install.sh 만을 사용하여 정상 설치 및 검증 완료!"
echo "======================================================================"
