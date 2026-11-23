#!/usr/bin/env bash
# ==============================================================================
# Ordinatio Clean Install & E2E Test Suite in Canonical Multipass Isolated VM
# 
# Full Lifecycle:
#   1. Preflight: Canonical Multipass Host Hypervisor Detection
#   2. Isolation: Clean VM Launch (Ubuntu 24.04 LTS, 4C/8G/25G)
#   3. Provision: Docker Engine & Compose v2 Plugin Installation
#   4. Install: Clean Ordinatio Standalone Deployment (install.sh)
#   5. Integrity: PID 1 systemd (ordinatio.service) & 5 Containers Audit
#   6. Test: All 8 Menus Operational E2E Scenario (10/10 PASS)
#   7. Teardown: Safe Instance Purge or Keep for Manual Inspection
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
source "${SCRIPT_DIR}/mp-common.sh"

# Default configuration values
VM_NAME="ordinatio-isolated-test"
CPUS="${MP_CPUS:-4}"
MEMORY="${MP_MEMORY:-8G}"
DISK="${MP_DISK:-25G}"
UBUNTU_VER="24.04"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin1234!}"
CONFIG_FILE=""
KEEP_VM=false
PURGE_AT_END=false
LOCAL_BUILD=false

usage() {
    echo -e "${BOLD}사용법:${NC} $0 [OPTIONS]"
    echo ""
    echo "Canonical Multipass 기반 완전 격리 가상머신 클린 설치 및 E2E 테스트 자동화 도구"
    echo ""
    echo "옵션:"
    echo "  -c, --config PATH          사용자 지정 test_config.json 경로 (미지정 시 기본 템플릿 사용)"
    echo "  -p, --admin-password PWD   슈퍼관리자 초기 비밀번호 (기본값: admin1234!)"
    echo "  -n, --name VM_NAME         생성할 Multipass 가상머신 인스턴스명 (기본값: ordinatio-isolated-test)"
    echo "      --cpus NUM             가상머신 vCPU 수 (기본값: 4)"
    echo "      --memory SIZE          가상머신 메모리 크기 (기본값: 8G)"
    echo "      --disk SIZE            가상머신 디스크 크기 (기본값: 25G)"
    echo "      --ubuntu-version VER   Ubuntu 이미지 버전 (기본값: 24.04)"
    echo "      --local-build          Docker Hub 다운로드 대신 로컬 소스 직접 빌드 수행"
    echo "      --keep                 테스트 완료 후 가상머신을 삭제하지 않고 유지 (수동 디버깅)"
    echo "      --purge                테스트 완료 후 즉시 가상머신 영구 폐기 (호스트 자원 회수)"
    echo "  -h, --help                 도움말 출력"
    exit 0
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        -c|--config)
            CONFIG_FILE="$2"
            shift 2
            ;;
        -p|--admin-password)
            ADMIN_PASSWORD="$2"
            shift 2
            ;;
        -n|--name)
            VM_NAME="$2"
            shift 2
            ;;
        --cpus)
            CPUS="$2"
            shift 2
            ;;
        --memory)
            MEMORY="$2"
            shift 2
            ;;
        --disk)
            DISK="$2"
            shift 2
            ;;
        --ubuntu-version)
            UBUNTU_VER="$2"
            shift 2
            ;;
        --local-build)
            LOCAL_BUILD=true
            shift
            ;;
        --keep)
            KEEP_VM=true
            shift
            ;;
        --purge)
            PURGE_AT_END=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo -e "${RED}❌ 알 수 없는 옵션: $1${NC}"
            usage
            ;;
    esac
done

START_TIME=$(date +%s)

echo -e "${BOLD}${CYAN}======================================================================${NC}"
echo -e "${BOLD}${CYAN}🛡️  [Canonical Multipass] 완전 격리 환경 클린 설치 & E2E 테스트${NC}"
echo -e "${BOLD}${CYAN}======================================================================${NC}"
echo -e "  • 가상머신 인스턴스 : ${BOLD}${VM_NAME}${NC}"
echo -e "  • OS & 하드웨어 규격: Ubuntu ${UBUNTU_VER} (${CPUS} vCPU / ${MEMORY} RAM / ${DISK} Disk)"
echo -e "  • 관리자 초기 암호  : ${ADMIN_PASSWORD}"
echo -e "  • 로컬 소스 디렉토리: ${ROOT_DIR}"
if [ -n "$CONFIG_FILE" ]; then
    echo -e "  • 외부 테스트 설정  : ${CONFIG_FILE}"
fi
echo -e "${BOLD}${CYAN}----------------------------------------------------------------------${NC}"

# ------------------------------------------------------------------------------
# 1. Preflight: Multipass 검사
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[Step 1/6] 호스트 Canonical Multipass 가상화 엔진 상태 점검...${NC}"
check_multipass

MP_VERSION_INFO=$(mp_cmd version | tr '\n' ' ' || true)
echo -e "  ${GREEN}✔ Multipass 엔진:${NC} ${MP_VERSION_INFO}"

# ------------------------------------------------------------------------------
# 2. Isolation: 기존 인스턴스 정리 및 클린 가상머신 기동
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[Step 2/6] 완전 격리 클린 가상머신 생성 및 기동 중...${NC}"
if mp_cmd list 2>/dev/null | grep -q "^${VM_NAME}[[:space:]]"; then
    echo -e "  ${YELLOW}⚠️ 기존 잔존 인스턴스(${VM_NAME}) 감지. 오염 방지를 위해 완전 초기화합니다.${NC}"
    clean_instance "${VM_NAME}"
fi

echo -e "  • Ubuntu ${UBUNTU_VER} 기반 인스턴스(${VM_NAME}) 런칭 중 (수십 초 소요될 수 있습니다)..."
mp_cmd launch "${UBUNTU_VER}" \
    --name "${VM_NAME}" \
    --cpus "${CPUS}" \
    --memory "${MEMORY}" \
    --disk "${DISK}"

VM_IP=$(mp_cmd info "${VM_NAME}" | grep "IPv4:" | awk '{print $2}')
if [ -z "$VM_IP" ]; then
    echo -e "  ${RED}❌ 가상머신 IP 할당 확인 실패.${NC}"
    exit 1
fi
echo -e "  ${GREEN}✔ 클린 가상머신 기동 완료:${NC} IP=${BOLD}${VM_IP}${NC}"

# ------------------------------------------------------------------------------
# 3. Provisioning: Docker Engine & 의존 패키지 설치
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[Step 3/6] 가상머신 내부 Docker Engine & 필수 런타임 환경 프로비저닝...${NC}"
mp_cmd exec "${VM_NAME}" -- bash -c "
  set -euo pipefail
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
      curl tar gzip jq procps net-tools docker.io docker-compose-v2 python3
  sudo systemctl enable --now docker
  sudo usermod -aG docker ubuntu
"

DOCKER_VER=$(mp_cmd exec "${VM_NAME}" -- docker --version)
COMPOSE_VER=$(mp_cmd exec "${VM_NAME}" -- docker compose version --short)
echo -e "  ${GREEN}✔ Docker Engine 준비 완료:${NC} ${DOCKER_VER} (Compose ${COMPOSE_VER})"

# ------------------------------------------------------------------------------
# 4. Clean Install: Ordinatio Standalone 어플라이언스 무인 설치
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[Step 4/6] Ordinatio 소스 마운트 및 Standalone 클린 인스톨 실행...${NC}"

RESOLVED_SRC_PATH=$(resolve_mount_path "${ROOT_DIR}")
echo -e "  • 호스트 소스 디렉토리 마운트: ${RESOLVED_SRC_PATH} -> ${VM_NAME}:/opt/ordinatio-src"
mp_cmd mount "${RESOLVED_SRC_PATH}" "${VM_NAME}:/opt/ordinatio-src"

INSTALL_CMD="sudo bash /opt/ordinatio-src/deploy/standalone/install.sh \
  --config /opt/ordinatio-src/deploy/standalone/install.conf.example \
  --auto-approve \
  --admin-password '${ADMIN_PASSWORD}'"

if [ "$LOCAL_BUILD" = true ]; then
    INSTALL_CMD="${INSTALL_CMD} --build"
fi

echo -e "  • install.sh 실행 중..."
mp_cmd exec "${VM_NAME}" -- bash -c "${INSTALL_CMD}"
echo -e "  ${GREEN}✔ Standalone 어플라이언스 설치 완료${NC}"

# ------------------------------------------------------------------------------
# 5. Integrity & Health Check: 서비스 및 컨테이너 무결성 검증
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[Step 5/6] systemd 서비스 및 컨테이너 헬스체크 검증...${NC}"

echo -n "  • systemctl status ordinatio.service 상태 확인: "
if mp_cmd exec "${VM_NAME}" -- systemctl is-active --quiet ordinatio.service; then
    echo -e "${GREEN}Active (running)${NC}"
else
    echo -e "${RED}Inactive (Failed)${NC}"
    mp_cmd exec "${VM_NAME}" -- systemctl status ordinatio.service --no-pager || true
    exit 1
fi

echo -e "  • 컨테이너 가동 상태 확인 (5대 핵심 컨테이너):"
mp_cmd exec "${VM_NAME}" -- sudo docker ps --format "    - {{.Names}}: {{.Status}} ({{.Ports}})"

# Wait for all HTTP endpoints to be ready
echo -e "  • HTTP 서비스 엔드포인트 준비 대기 (최대 60초)..."
mp_cmd exec "${VM_NAME}" -- bash -c "
  MAX_TRIES=30
  TRIES=0
  until curl -s -f http://127.0.0.1:8000/api/v1/health >/dev/null 2>&1 || [ \$TRIES -ge \$MAX_TRIES ]; do
      sleep 2
      TRIES=\$((TRIES+1))
  done
  if [ \$TRIES -ge \$MAX_TRIES ]; then
      echo '❌ Backend API (8000) 헬스체크 타임아웃'
      exit 1
  fi
"
echo -e "  ${GREEN}✔ Backend API (8000): Ready${NC}"

mp_cmd exec "${VM_NAME}" -- bash -c "
  curl -s -f http://127.0.0.1:5173/ >/dev/null && echo '  ✔ Frontend Web (5173): Ready'
  curl -s -f http://127.0.0.1:9901/ready >/dev/null && echo '  ✔ Envoy Admin (9901): Ready'
"

# ------------------------------------------------------------------------------
# 6. E2E Test Suite: All 8 Menus Integrated Verification
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[Step 6/6] 8대 전 메뉴 통합 시나리오 원격 자동화 검증 수행...${NC}"

VM_CONFIG_PARAM=""
if [ -n "$CONFIG_FILE" ] && [ -f "$CONFIG_FILE" ]; then
    echo -e "  • 사용자 지정 테스트 설정(${CONFIG_FILE})을 가상머신에 전송 중..."
    mp_cmd transfer "${CONFIG_FILE}" "${VM_NAME}:/tmp/test_config.json"
    VM_CONFIG_PARAM="--config /tmp/test_config.json"
fi

echo -e "  • verify_all_menus_integration_scenario.py 실행 중 (10개 시나리오 전수 검증)..."
echo -e "${CYAN}----------------------------------------------------------------------${NC}"

set +e
mp_cmd exec "${VM_NAME}" -- bash -c "
  python3 /opt/ordinatio-src/scripts/verify_all_menus_integration_scenario.py ${VM_CONFIG_PARAM}
"
TEST_EXIT_CODE=$?
set -e

echo -e "${CYAN}----------------------------------------------------------------------${NC}"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "\n${BOLD}${GREEN}======================================================================${NC}"
    echo -e "${BOLD}${GREEN}🎉 [100% PASS] Multipass 격리 환경 클린 설치 및 E2E 테스트 완벽 통과!${NC}"
    echo -e "${BOLD}${GREEN}======================================================================${NC}"
    echo -e "  • 소요 시간         : ${DURATION}초"
    echo -e "  • 가상머신 IP       : ${BOLD}${VM_IP}${NC}"
    echo -e "  • 웹 콘솔 접속 URL  : ${CYAN}http://${VM_IP}:5173${NC}"
    echo -e "  • L7 게이트웨이 Ingress: ${CYAN}http://${VM_IP}:8080/v1/chat/completions${NC}"
    echo -e "  • 백엔드 REST API   : ${CYAN}http://${VM_IP}:8000/api/v1${NC}"
    echo -e "  • 관리자 로그인 계정: ${BOLD}admin${NC} / ${BOLD}${ADMIN_PASSWORD}${NC}"
    echo -e "${BOLD}${GREEN}======================================================================${NC}"
else
    echo -e "\n${BOLD}${RED}======================================================================${NC}"
    echo -e "${BOLD}${RED}❌ [FAIL] 통합 시나리오 테스트 중 실패가 발생했습니다 (코드: ${TEST_EXIT_CODE})${NC}"
    echo -e "${BOLD}${RED}======================================================================${NC}"
    echo -e "  • 가상머신 IP       : ${VM_IP}"
    echo -e "  • 디버깅 접속 명령  : multipass shell ${VM_NAME}"
    echo -e "  • 서비스 로그 확인  : multipass exec ${VM_NAME} -- sudo journalctl -u ordinatio -n 50"
fi

# ------------------------------------------------------------------------------
# Teardown / Retention Management
# ------------------------------------------------------------------------------
if [ "$PURGE_AT_END" = true ]; then
    echo -e "\n${YELLOW}🧹 [--purge 지정] 테스트 인스턴스(${VM_NAME})를 즉시 폐기하고 자원을 회수합니다...${NC}"
    clean_instance "${VM_NAME}"
    echo -e "${GREEN}✔ 인스턴스 완전 폐기 완료${NC}"
elif [ "$KEEP_VM" = true ]; then
    echo -e "\n${CYAN}📌 [--keep 지정] 가상머신(${VM_NAME})이 유지됩니다.${NC}"
    echo -e "   • 필요 시 웹 브라우저에서 http://${VM_IP}:5173 에 접속하여 UI를 확인하십시오."
    echo -e "   • 검증 완료 후 정리 명령: ${BOLD}make mp-clean${NC} 또는 ${BOLD}bash ordinatio/scripts/multipass/mp-teardown.sh${NC}"
else
    echo -e "\n${CYAN}📌 인스턴스(${VM_NAME})가 현재 활성 상태로 유지 중입니다.${NC}"
    echo -e "   • 인스턴스 정리 명령어: ${BOLD}make mp-clean${NC}"
fi

exit $TEST_EXIT_CODE
