#!/usr/bin/env bash
# ==============================================================================
# Ordinatio Standalone Automated E2E Runner via Multipass
# Full Lifecycle: Clean VM -> Docker -> install.sh -> systemctl -> Healthcheck
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
source "${SCRIPT_DIR}/mp-common.sh"

VM_NAME="ordinatio-standalone"
CPUS="${MP_CPUS:-4}"
MEMORY="${MP_MEMORY:-8G}"
DISK="${MP_DISK:-20G}"

echo -e "${BOLD}${CYAN}======================================================================${NC}"
echo -e "${BOLD}${CYAN}🚀 [Multipass Standalone] Clean VM Provisioning & install.sh Audit${NC}"
echo -e "${BOLD}${CYAN}======================================================================${NC}"

# 1. Check existing instance
if mp_cmd list 2>/dev/null | grep -q "^${VM_NAME}[[:space:]]"; then
    echo -e "${YELLOW}⚠️ 기존 테스트 인스턴스(${VM_NAME}) 감지. 초기화 진행...${NC}"
    mp_cmd stop "${VM_NAME}" 2>/dev/null || true
    mp_cmd delete "${VM_NAME}" 2>/dev/null || true
    mp_cmd purge 2>/dev/null || true
fi

# 2. Launch Clean Ubuntu 24.04 VM
echo -e "\n${BOLD}[1/5] 클린 가상머신 생성 중 (${VM_NAME}: ${CPUS} vCPU, ${MEMORY} RAM, ${DISK} Disk)...${NC}"
mp_cmd launch 24.04 --name "${VM_NAME}" --cpus "${CPUS}" --memory "${MEMORY}" --disk "${DISK}"

VM_IP=$(mp_cmd info "${VM_NAME}" | grep "IPv4:" | awk '{print $2}')
echo -e "${GREEN}✔ 가상머신 기동 완료 (IP: ${VM_IP})${NC}"

# 3. Install Docker in VM
echo -e "\n${BOLD}[2/5] 가상머신 내 Docker Engine & Docker Compose Plugin 설치...${NC}"
mp_cmd exec "${VM_NAME}" -- bash -c "
  sudo apt-get update -qq
  sudo apt-get install -y -qq curl tar gzip jq procps net-tools docker.io docker-compose-v2
  sudo systemctl enable --now docker
"
echo -e "${GREEN}✔ Docker 데몬 및 의존 패키지 준비 완료${NC}"

# 4. Transfer/Mount repository & Execute install.sh
echo -e "\n${BOLD}[3/5] Ordinatio 소스 마운트 및 Standalone install.sh 실행...${NC}"
mp_cmd mount "${ROOT_DIR}" "${VM_NAME}:/opt/ordinatio-src"

mp_cmd exec "${VM_NAME}" -- bash -c "
  sudo bash /opt/ordinatio-src/deploy/standalone/install.sh --auto-approve
"
echo -e "${GREEN}✔ install.sh 자동 설치 완결${NC}"

# 5. Verify systemd and services
echo -e "\n${BOLD}[4/5] systemctl status ordinatio 및 Docker Compose 서비스 무결성 검증...${NC}"
mp_cmd exec "${VM_NAME}" -- systemctl is-active ordinatio
mp_cmd exec "${VM_NAME}" -- systemctl status ordinatio --no-pager
echo -e "${GREEN}✔ systemctl ordinatio.service 활성 상태 확인 완료 (PID 1 systemd 완결)${NC}"

# 6. Verify HTTP health probes
echo -e "\n${BOLD}[5/5] HTTP 엔드포인트 헬스체크 (Backend, Frontend, Envoy)...${NC}"
mp_cmd exec "${VM_NAME}" -- bash -c "
  curl -s -f http://127.0.0.1:8000/api/v1/health >/dev/null && echo '  ✔ Backend API (8000): HEALTHY'
  curl -s -f http://127.0.0.1:5173/ >/dev/null && echo '  ✔ Frontend Web (5173): HEALTHY'
  curl -s -f http://127.0.0.1:9901/ready >/dev/null && echo '  ✔ Envoy Admin (9901): READY'
"

echo -e "\n${BOLD}${GREEN}======================================================================${NC}"
echo -e "${BOLD}${GREEN}🎉 SUCCESS: Multipass 기반 Standalone 모드 및 systemctl 검증 100% 통과!${NC}"
echo -e "   • 가상머신 IP:  http://${VM_IP}:5173"
echo -e "   • 정리 명령어: make mp-clean"
echo -e "${BOLD}${GREEN}======================================================================${NC}"
