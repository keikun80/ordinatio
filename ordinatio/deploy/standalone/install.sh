#!/usr/bin/env bash
# ==============================================================================
# Ordinatio Standalone Mode Appliance Installer
# Single-Host Self-Contained Deployment Engine for Enterprise Linux 9
# ==============================================================================

set -euo pipefail

# ANSI Color Codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

INSTALLER_VERSION="0.1.5"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# ------------------------------------------------------------------------------
# Default Settings (Overridden by install.conf and then CLI flags)
# ------------------------------------------------------------------------------
ACTION="install"
PURGE_DATA=false
CONFIG_FILE=""
TARGET_DIR="/opt/ordinatio"
AUTO_APPROVE=false
ADMIN_PASSWORD=""
DATACENTER_NAME="온프레미스 주전산센터"
CLUSTER_REGION="DC-1 서울"
SKIP_BUILD=false
SKIP_PULL=false
USE_LOCAL_BUILD=false
SEED_DEMO_DATA=false

BACKEND_IMAGE="keikun808/ordinatio-backend:0.1.5"
FRONTEND_IMAGE="keikun808/ordinatio-frontend:0.1.5"

INITIAL_ADMIN_USERNAME="admin"
INITIAL_ADMIN_EMAIL="admin@ordinatio.local"
INITIAL_ADMIN_PASSWORD=""
FRONTEND_PORT=5173
BACKEND_PORT=8000
ENVOY_TRAFFIC_PORT=8080
ENVOY_ADMIN_PORT=9901
REDIS_PORT=6379
POSTGRES_PORT=5432

DOCKER_BRIDGE_GATEWAY_IP="172.20.0.1"
DNS_SERVER="8.8.8.8"
BEHIND_PROXY=true
TRUSTED_PROXIES="127.0.0.1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,testclient"
ENVOY_XFF_NUM_TRUSTED_HOPS=1
ENFORCE_SSL_REDIRECT=false

GATEWAY_READ_TIMEOUT=120.0
GATEWAY_CONNECT_TIMEOUT=10.0
MODEL_HEALTH_CHECK_DEFAULT_TIMEOUT=3.0

CUSTOM_POSTGRES_PASSWORD=""
CUSTOM_SECRET_KEY=""
CUSTOM_PII_SALT=""
CUSTOM_WORM_KEY=""

# ------------------------------------------------------------------------------
# Helper Functions
# ------------------------------------------------------------------------------
log_info() {
    echo -e "${CYAN}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_banner() {
    echo -e "${BLUE}${BOLD}"
    cat << "EOF"
    ___    ____   ____             __               __            
   /   |  /  _/  / __ \___________/ /_  ___  _____/ /__________ _
  / /| |  / /   / / / / ___/ ___/ __ \/ _ \/ ___/ __/ ___/ __ `/
 / ___ |_/ /   / /_/ / /  / /__/ / / /  __(__  ) /_/ /  / /_/ / 
/_/  |_/___/   \____/_/   \___/_/ /_/\___/____/\__/_/   \__,_/  
                                                                
     Standalone Appliance Installer 0.1.5 (Enterprise Linux 9)
EOF
    echo -e "${NC}"
}

do_uninstall() {
    echo -e "${BOLD}================================================================${NC}"
    echo -e "${BOLD}🗑️  Ordinatio Standalone Appliance 제거 (Uninstall)${NC}"
    echo -e "${BOLD}================================================================${NC}"

    if [[ $EUID -ne 0 ]]; then
        log_error "제거 작업은 root 권한으로 실행되어야 합니다 (sudo $0 --uninstall)."
        exit 1
    fi

    log_warn "설치 대상 경로: ${TARGET_DIR}"
    if [ "$PURGE_DATA" = true ]; then
        log_warn "⚠️  경고: --purge 옵션 활성화. 모든 데이터(DB, 감사로그, 설정)가 영구 삭제됩니다!"
    else
        log_info "데이터 보존 모드: 서비스 및 컨테이너만 제거되며, 데이터(${TARGET_DIR}/data)는 보존됩니다."
    fi

    if [ "$AUTO_APPROVE" = false ]; then
        read -p "정말 Ordinatio 어플라이언스를 제거하시겠습니까? (y/N): " -r confirm
        if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
            log_info "제거 작업이 취소되었습니다."
            exit 0
        fi
    fi

    echo ""
    # 1. Systemd 서비스 중지 및 비활성화
    log_info "1. Systemd 서비스 중지 및 등록 해제 중..."
    if systemctl is-active --quiet ordinatio.service 2>/dev/null; then
        systemctl stop ordinatio.service 2>/dev/null || true
    fi
    if systemctl is-enabled --quiet ordinatio.service 2>/dev/null; then
        systemctl disable ordinatio.service 2>/dev/null || true
    fi
    if [ -f /etc/systemd/system/ordinatio.service ]; then
        rm -f /etc/systemd/system/ordinatio.service
        systemctl daemon-reload
        log_success "Systemd 서비스(/etc/systemd/system/ordinatio.service) 제거 완료."
    fi

    # 2. Docker Compose 및 컨테이너 정리
    log_info "2. Docker 컨테이너 및 가상 네트워크 정리 중..."
    if [ -f "${TARGET_DIR}/docker-compose.standalone.yml" ] && command -v docker &>/dev/null; then
        if [ "$PURGE_DATA" = true ]; then
            docker compose -f "${TARGET_DIR}/docker-compose.standalone.yml" down -v --remove-orphans 2>/dev/null || true
        else
            docker compose -f "${TARGET_DIR}/docker-compose.standalone.yml" down --remove-orphans 2>/dev/null || true
        fi
    fi

    # 잔여 컨테이너 강제 정리
    if command -v docker &>/dev/null; then
        for c in ordinatio-backend ordinatio-frontend ordinatio-envoy ordinatio-postgres ordinatio-redis; do
            if docker ps -a --format '{{.Names}}' | grep -q "^${c}$"; then
                docker rm -f "$c" 2>/dev/null || true
            fi
        done
    fi
    log_success "컨테이너 및 가상 네트워크 정리 완료."

    # 3. 호스트 관리 도구 링크 정리
    log_info "3. 호스트 관리 도구(/usr/local/bin/ordinatio-ctl) 제거 중..."
    if [ -L /usr/local/bin/ordinatio-ctl ] || [ -f /usr/local/bin/ordinatio-ctl ]; then
        rm -f /usr/local/bin/ordinatio-ctl
        log_success "ordinatio-ctl 링크 제거 완료."
    fi

    # 4. 파일 및 디렉토리 정리
    log_info "4. 파일 및 디렉토리 정리 중..."
    if [ "$PURGE_DATA" = true ]; then
        if [ -d "${TARGET_DIR}" ]; then
            rm -rf "${TARGET_DIR}"
            log_success "설치 디렉토리 전체 영구 삭제 완료 (${TARGET_DIR})."
        fi
    else
        if [ -d "${TARGET_DIR}" ]; then
            rm -f "${TARGET_DIR}/docker-compose.standalone.yml" "${TARGET_DIR}/.env" "${TARGET_DIR}/.env.bak"
            rm -rf "${TARGET_DIR}/deploy" "${TARGET_DIR}/bin" "${TARGET_DIR}/backend" "${TARGET_DIR}/frontend"
            log_success "서비스 런타임 파일 정리 완료."
            log_info "📌 데이터 디렉토리는 안전하게 보존되었습니다: ${TARGET_DIR}/data"
            log_info "   (데이터까지 완전히 삭제하려면: sudo rm -rf ${TARGET_DIR} 또는 --purge 옵션 사용)"
        fi
    fi

    echo ""
    echo -e "${GREEN}${BOLD}================================================================${NC}"
    echo -e "${GREEN}${BOLD}🎉 Ordinatio 어플라이언스 제거가 완료되었습니다.${NC}"
    echo -e "${GREEN}${BOLD}================================================================${NC}"
    exit 0
}

usage() {
    echo -e "${BOLD}사용법:${NC} sudo $0 [OPTIONS]"
    echo ""
    echo "옵션:"
    echo "  -c, --config PATH        외부 환경설정 파일 지정 (지정하지 않을 시 ./install.conf 또는 install.conf.example 탐색)"
    echo "  -y, --auto-approve       대화형 확인 프롬프트 생략 (무인 자동 설치/제거)"
    echo "      --uninstall          Standalone 어플라이언스 서비스 중지 및 시스템 제거"
    echo "      --purge              --uninstall 시 데이터 디렉토리(${TARGET_DIR}/data) 포함 전체 영구 삭제"
    echo "      --admin-password     슈퍼관리자 초기 비밀번호 지정 (미지정 시 무작위 생성)"
    echo "      --datacenter-name    데이터센터 명칭 지정 (기본값: 온프레미스 주전산센터)"
    echo "      --cluster-region     클러스터 리전/존 명칭 지정 (기본값: DC-1 서울)"
    echo "      --target-dir PATH    설치 대상 디렉토리 (기본값: /opt/ordinatio)"
    echo "      --source-dir PATH    ordinatio 소스 루트 디렉토리"
    echo "      --backend-image IMG  백엔드 컨테이너 이미지 (기본값: keikun808/ordinatio-backend:0.1.5)"
    echo "      --frontend-image IMG 프론트엔드 컨테이너 이미지 (기본값: keikun808/ordinatio-frontend:0.1.5)"
    echo "      --frontend-port PORT 프론트엔드 웹 포트 지정 (기본값: 5173)"
    echo "      --dns-server IP      컨테이너 DNS 서버 지정 (기본값: 8.8.8.8)"
    echo "      --skip-pull          컨테이너 이미지 다운로드(Pull) 단계 생략"
    echo "      --skip-build         컨테이너 이미지 다운로드/빌드 단계 생략"
    echo "      --build              Docker Hub 대신 로컬 소스 빌드 강제"
    echo "      --seed-demo          데모/샘플 데이터(테넌트, 모델, 감사로그) 적재 (기본값: 클린 설치)"
    echo "  -h, --help               도움말 출력"
    echo ""
    exit 0
}

# ------------------------------------------------------------------------------
# Config File Loader
# ------------------------------------------------------------------------------
load_config_file() {
    local conf="$1"
    if [ -f "$conf" ]; then
        log_info "외부 환경설정 파일 로드 중: ${conf}"
        chmod 600 "$conf" 2>/dev/null || true
        set -a
        # shellcheck source=/dev/null
        source "$conf"
        set +a
        log_success "환경설정 파일 적용 완료."
        return 0
    fi
    return 1
}

# ------------------------------------------------------------------------------
# 1차 파싱: --config 또는 -c 옵션 우선 확인
# ------------------------------------------------------------------------------
ARGS=("$@")
for ((i=0; i<${#ARGS[@]}; i++)); do
    case "${ARGS[i]}" in
        -c|--config)
            CONFIG_FILE="${ARGS[i+1]}"
            ;;
    esac
done

# 설정 파일 로드 (지정 파일 -> 현재 디렉토리 ./install.conf -> 소스 디렉토리)
if [ -n "$CONFIG_FILE" ]; then
    if ! load_config_file "$CONFIG_FILE"; then
        log_error "지정된 설정 파일을 찾을 수 없습니다: ${CONFIG_FILE}"
        exit 1
    fi
elif [ -f "./install.conf" ]; then
    load_config_file "./install.conf"
elif [ -f "${SOURCE_DIR}/deploy/install.conf" ]; then
    load_config_file "${SOURCE_DIR}/deploy/install.conf"
elif [ -f "${SOURCE_DIR}/deploy/standalone/install.conf" ]; then
    load_config_file "${SOURCE_DIR}/deploy/standalone/install.conf"
fi

# ------------------------------------------------------------------------------
# 2차 파싱: CLI 옵션이 설정 파일 값을 오버라이드
# ------------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        -c|--config)
            CONFIG_FILE="$2"
            shift 2
            ;;
        -y|--auto-approve)
            AUTO_APPROVE=true
            shift
            ;;
        --uninstall)
            ACTION="uninstall"
            shift
            ;;
        --purge)
            PURGE_DATA=true
            shift
            ;;
        --admin-password)
            ADMIN_PASSWORD="$2"
            shift 2
            ;;
        --datacenter-name)
            DATACENTER_NAME="$2"
            shift 2
            ;;
        --cluster-region)
            CLUSTER_REGION="$2"
            shift 2
            ;;
        --target-dir)
            TARGET_DIR="$2"
            shift 2
            ;;
        --source-dir)
            SOURCE_DIR="$2"
            shift 2
            ;;
        --backend-image)
            BACKEND_IMAGE="$2"
            shift 2
            ;;
        --frontend-image)
            FRONTEND_IMAGE="$2"
            shift 2
            ;;
        --frontend-port)
            FRONTEND_PORT="$2"
            shift 2
            ;;
        --dns-server)
            DNS_SERVER="$2"
            shift 2
            ;;
        --skip-pull)
            SKIP_PULL=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            SKIP_PULL=true
            shift
            ;;
        --build)
            USE_LOCAL_BUILD=true
            shift
            ;;
        --seed-demo)
            SEED_DEMO_DATA=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            log_error "알 수 없는 옵션: $1"
            usage
            ;;
    esac
done

# 언인스톨 모드 분기
if [ "$ACTION" = "uninstall" ]; then
    do_uninstall
fi

print_banner

if [ "$AUTO_APPROVE" = false ]; then
    read -p "컨테이너 DNS 서버 [${DNS_SERVER}]: " -r requested_dns
    if [ -n "$requested_dns" ]; then
        DNS_SERVER="$requested_dns"
    fi
fi

# ------------------------------------------------------------------------------
# [Safety Guard] 호스트 사전 요구사항(System Requirements) 비침습 검증
# ------------------------------------------------------------------------------
echo -e "${BOLD}================================================================${NC}"
echo -e "${BOLD}🔍 [Safety Guard] 사전 인프라 요구사항 확인${NC}"
echo -e "${BOLD}================================================================${NC}"

# 1. Root 권한 검사
if [[ $EUID -ne 0 ]]; then
    log_error "본 설치 스크립트는 root 권한으로 실행되어야 합니다 (sudo $0)."
    exit 1
fi
log_success "Root 권한 확인 완료."

# 2. Docker Engine 실행 여부 검사
if ! command -v docker &> /dev/null; then
    log_error "Docker Engine이 설치되어 있지 않습니다."
    echo -e "${YELLOW}👉 호스트 사전 요구사항 매뉴얼(PREREQUISITES.md)을 참조하여 Docker를 먼저 설치하십시오.${NC}"
    exit 1
fi

if ! docker info &> /dev/null; then
    log_error "Docker 데몬이 구동 중이지 않습니다. (systemctl start docker 실행 필요)"
    exit 1
fi
log_success "Docker Engine 구동 상태 확인 완료 ($(docker --version))."

# 3. Docker Compose v2 플러그인 검사
if ! docker compose version &> /dev/null; then
    log_error "Docker Compose v2 플러그인이 감지되지 않습니다."
    echo -e "${YELLOW}👉 호스트 사전 요구사항 매뉴얼(PREREQUISITES.md)을 참조하여 docker-compose-plugin을 설치하십시오.${NC}"
    exit 1
fi
log_success "Docker Compose 확인 완료 ($(docker compose version --short))."

# 4. 필수 포트 충돌 검사
PORTS_TO_CHECK=("$FRONTEND_PORT" "$BACKEND_PORT" "$ENVOY_TRAFFIC_PORT" "$ENVOY_ADMIN_PORT")
CONFLICT=false
for p in "${PORTS_TO_CHECK[@]}"; do
    if ss -tulpn | grep -q ":${p}\b"; then
        log_warn "포트 ${p}번이 이미 다른 프로세스에 의해 점유되어 있습니다."
        CONFLICT=true
    fi
done
if [ "$CONFLICT" = true ] && [ "$AUTO_APPROVE" = false ]; then
    read -p "포트 충돌이 감지되었습니다. 계속 진행하시겠습니까? (y/N): " -r choice
    if [[ ! "$choice" =~ ^[Yy]$ ]]; then
        log_error "사용자에 의해 설치가 취소되었습니다."
        exit 1
    fi
fi
log_success "포트 점유 사전 점검 완료."

echo ""
log_info "설치 대상 경로: ${BOLD}${TARGET_DIR}${NC}"
log_info "소스 파일 경로: ${BOLD}${SOURCE_DIR}${NC}"
log_info "백엔드 이미지 : ${BOLD}${BACKEND_IMAGE}${NC}"
log_info "프론트 이미지 : ${BOLD}${FRONTEND_IMAGE}${NC}"
log_info "데이터센터 식별: ${BOLD}${DATACENTER_NAME} (${CLUSTER_REGION})${NC}"
log_info "도커 브릿지 IP: ${BOLD}${DOCKER_BRIDGE_GATEWAY_IP}${NC}"
log_info "컨테이너 DNS  : ${BOLD}${DNS_SERVER}${NC}"

if [ "$AUTO_APPROVE" = false ]; then
    read -p "Standalone 어플라이언스 설치를 시작하시겠습니까? (Y/n): " -r confirm
    if [[ "$confirm" =~ ^[Nn]$ ]]; then
        log_info "설치가 취소되었습니다."
        exit 0
    fi
fi

# ------------------------------------------------------------------------------
# [Step 1] 어플라이언스 레이아웃 배치 및 동적 시크릿 생성
# ------------------------------------------------------------------------------
echo ""
echo -e "${BOLD}================================================================${NC}"
echo -e "${BOLD}📁 [Step 1] 어플라이언스 레이아웃 배치 & 동적 암호화 시크릿 생성${NC}"
echo -e "${BOLD}================================================================${NC}"

# 기존 잔여 데이터베이스 및 실행 중인 서비스 정리 검사
if [ -d "${TARGET_DIR}/data/postgres" ] && [ "$(ls -A "${TARGET_DIR}/data/postgres" 2>/dev/null)" ]; then
    echo ""
    log_warn "기존 데이터베이스(${TARGET_DIR}/data/postgres)가 감지되었습니다."
    log_warn "신규 설치 시 보안을 위해 새로운 암호화 키와 DB 시크릿이 독립 발급되므로, 기존 데이터가 남아있으면 패스워드 불일치 오류가 발생합니다."
    
    if [ "$AUTO_APPROVE" = false ]; then
        read -p "기존 데이터를 초기화하고 클린 설치를 진행하시겠습니까? (y/N): " -r clean_confirm
        if [[ ! "$clean_confirm" =~ ^[Yy]$ ]]; then
            log_error "설치가 중단되었습니다."
            log_error "기존 데이터를 보존하려면 현재 시스템을 유지하거나, 완전 삭제 후 재설치하려면: sudo $0 --uninstall --purge"
            exit 1
        fi
    fi
    log_info "기존 데이터베이스 및 볼륨을 초기화합니다..."
    if [ -f "${TARGET_DIR}/docker-compose.standalone.yml" ] && command -v docker &>/dev/null; then
        docker compose -f "${TARGET_DIR}/docker-compose.standalone.yml" down -v --remove-orphans 2>/dev/null || true
    fi
    rm -rf "${TARGET_DIR}/data/postgres"/* "${TARGET_DIR}/data/postgres"/.* 2>/dev/null || true
    log_success "기존 데이터베이스 초기화 완료."
fi

# 디렉토리 트리 생성
mkdir -p "${TARGET_DIR}/data/"{postgres,redis,logs,worm_audit}
mkdir -p "${TARGET_DIR}/deploy/"{postgres,envoy,frontend}
mkdir -p "${TARGET_DIR}/bin"
chmod 700 "${TARGET_DIR}/data"

# 소스 파일 복사
log_info "설정 파일 및 DDL 복사 중..."
cp "${SOURCE_DIR}/deploy/standalone/docker-compose.standalone.yml" "${TARGET_DIR}/docker-compose.standalone.yml"
cp "${SOURCE_DIR}/deploy/postgres/init.sql" "${TARGET_DIR}/deploy/postgres/init.sql"
cp "${SOURCE_DIR}/deploy/envoy/envoy.yaml" "${TARGET_DIR}/deploy/envoy/envoy.yaml"
if [ -f "${SOURCE_DIR}/deploy/frontend/default.conf" ]; then
    cp "${SOURCE_DIR}/deploy/frontend/default.conf" "${TARGET_DIR}/deploy/frontend/default.conf"
elif [ -f "${SOURCE_DIR}/frontend/nginx.conf" ]; then
    cp "${SOURCE_DIR}/frontend/nginx.conf" "${TARGET_DIR}/deploy/frontend/default.conf"
fi
chmod -R 755 "${TARGET_DIR}/deploy"
chmod 644 "${TARGET_DIR}/deploy/envoy/envoy.yaml" "${TARGET_DIR}/deploy/postgres/init.sql" "${TARGET_DIR}/deploy/frontend/default.conf" 2>/dev/null || true

# Docker Bridge Gateway IP 치환 (Envoy upstream 클러스터 주소)
if [ -n "$DOCKER_BRIDGE_GATEWAY_IP" ] && [ "$DOCKER_BRIDGE_GATEWAY_IP" != "172.20.0.1" ]; then
    log_info "Envoy 업스트림 브릿지 IP 치환 중: 172.20.0.1 -> ${DOCKER_BRIDGE_GATEWAY_IP}"
    sed -i "s/address: 172.20.0.1/address: ${DOCKER_BRIDGE_GATEWAY_IP}/g" "${TARGET_DIR}/deploy/envoy/envoy.yaml"
fi

if [ -f "${TARGET_DIR}/.env" ]; then
    log_warn "기존 .env 파일이 존재하여 백업을 생성합니다 (${TARGET_DIR}/.env.bak)."
    cp "${TARGET_DIR}/.env" "${TARGET_DIR}/.env.bak"
    chmod 600 "${TARGET_DIR}/.env.bak"
fi

# 동적 암호화 시크릿 결정 (신규 독립 발급)
DYN_POSTGRES_PASS="${CUSTOM_POSTGRES_PASSWORD:-$(openssl rand -hex 16)}"
DYN_SECRET_KEY="${CUSTOM_SECRET_KEY:-$(openssl rand -hex 32)}"
DYN_PII_SALT="${CUSTOM_PII_SALT:-$(openssl rand -hex 32)}"
DYN_WORM_KEY="${CUSTOM_WORM_KEY:-$(openssl rand -hex 32)}"

# .env.template 기반 .env 생성
sed \
  -e "s/__DYNAMIC_POSTGRES_PASSWORD__/${DYN_POSTGRES_PASS}/g" \
  -e "s/__DYNAMIC_SECRET_KEY__/${DYN_SECRET_KEY}/g" \
  -e "s/__DYNAMIC_PII_SALT__/${DYN_PII_SALT}/g" \
  -e "s/__DYNAMIC_WORM_KEY__/${DYN_WORM_KEY}/g" \
  -e "s|__DATACENTER_NAME__|${DATACENTER_NAME}|g" \
  -e "s|__CLUSTER_REGION__|${CLUSTER_REGION}|g" \
  -e "s/SEED_DEMO_DATA=false/SEED_DEMO_DATA=${SEED_DEMO_DATA}/g" \
  -e "s|__BACKEND_IMAGE__|${BACKEND_IMAGE}|g" \
  -e "s|__FRONTEND_IMAGE__|${FRONTEND_IMAGE}|g" \
  -e "s|__DNS_SERVER__|${DNS_SERVER}|g" \
  -e "s/__INITIAL_ADMIN_USERNAME__/${INITIAL_ADMIN_USERNAME}/g" \
  -e "s/__INITIAL_ADMIN_EMAIL__/${INITIAL_ADMIN_EMAIL}/g" \
  -e "s/__BACKEND_PORT__/${BACKEND_PORT}/g" \
  -e "s/__FRONTEND_PORT__/${FRONTEND_PORT}/g" \
  -e "s/__ENVOY_TRAFFIC_PORT__/${ENVOY_TRAFFIC_PORT}/g" \
  -e "s/__ENVOY_ADMIN_PORT__/${ENVOY_ADMIN_PORT}/g" \
  -e "s/__REDIS_PORT__/${REDIS_PORT}/g" \
  -e "s/__POSTGRES_PORT__/${POSTGRES_PORT}/g" \
  -e "s/__DOCKER_BRIDGE_GATEWAY_IP__/${DOCKER_BRIDGE_GATEWAY_IP}/g" \
  -e "s/__GATEWAY_READ_TIMEOUT__/${GATEWAY_READ_TIMEOUT}/g" \
  -e "s/__GATEWAY_CONNECT_TIMEOUT__/${GATEWAY_CONNECT_TIMEOUT}/g" \
  -e "s/__MODEL_HEALTH_CHECK_DEFAULT_TIMEOUT__/${MODEL_HEALTH_CHECK_DEFAULT_TIMEOUT}/g" \
  -e "s/__BEHIND_PROXY__/${BEHIND_PROXY}/g" \
  -e "s|__TRUSTED_PROXIES__|${TRUSTED_PROXIES}|g" \
  -e "s/__ENVOY_XFF_NUM_TRUSTED_HOPS__/${ENVOY_XFF_NUM_TRUSTED_HOPS}/g" \
  -e "s/__ENFORCE_SSL_REDIRECT__/${ENFORCE_SSL_REDIRECT}/g" \
  "${SOURCE_DIR}/deploy/standalone/.env.template" > "${TARGET_DIR}/.env"

chmod 600 "${TARGET_DIR}/.env"
log_success "Standalone 환경 설정(.env) 보안 권한 적용 완료."

# ------------------------------------------------------------------------------
# [Step 2] 컨테이너 이미지 프로비저닝 (Offline Load / External Registry Pull)
# ------------------------------------------------------------------------------
echo ""
echo -e "${BOLD}================================================================${NC}"
echo -e "${BOLD}📦 [Step 2] 컨테이너 이미지 프로비저닝${NC}"
echo -e "${BOLD}================================================================${NC}"

OFFLINE_TAR="${SOURCE_DIR}/ordinatio-standalone-images.tar.gz"
RUNTIME_IMAGES=(
    "${BACKEND_IMAGE}"
    "${FRONTEND_IMAGE}"
    "postgres:15-alpine"
    "redis:7-alpine"
    "envoyproxy/envoy:v1.31.2"
)
if [ -f "$OFFLINE_TAR" ]; then
    log_info "에어갭 오프라인 이미지 아카이브 로딩 중: ${OFFLINE_TAR}"
    docker load -i "$OFFLINE_TAR"
    log_success "오프라인 이미지 로드 완료."
elif [ "$USE_LOCAL_BUILD" = true ]; then
    log_info "로컬 컨테이너 이미지 빌드 수행 중 (backend & frontend)..."
    mkdir -p "${TARGET_DIR}/backend" "${TARGET_DIR}/frontend"
    if command -v rsync &>/dev/null; then
        rsync -a --delete --exclude 'node_modules' --exclude '.venv' --exclude '__pycache__' --exclude 'dist' --exclude '.git' "${SOURCE_DIR}/backend/" "${TARGET_DIR}/backend/"
        rsync -a --delete --exclude 'node_modules' --exclude '.venv' --exclude '__pycache__' --exclude 'dist' --exclude '.git' "${SOURCE_DIR}/frontend/" "${TARGET_DIR}/frontend/"
    else
        cp -r "${SOURCE_DIR}/backend"/* "${TARGET_DIR}/backend/" || true
        cp -r "${SOURCE_DIR}/frontend"/* "${TARGET_DIR}/frontend/" || true
    fi
    
    docker compose -f "${TARGET_DIR}/docker-compose.standalone.yml" build
    log_success "컨테이너 이미지 빌드 완료."
elif [ "$SKIP_PULL" = false ] && [ "$SKIP_BUILD" = false ]; then
    log_info "오프라인 번들이 없어 외부 이미지 레지스트리에서 런타임 이미지 5종을 다운로드합니다..."
    for image in "${RUNTIME_IMAGES[@]}"; do
        log_info "  - Pull: ${image}"
        if ! docker pull "${image}"; then
            log_error "이미지 다운로드 실패: ${image}"
            log_error "오프라인 환경에서는 ordinatio-standalone-images.tar.gz 번들을 제공하거나 --skip-pull을 사용하십시오."
            exit 1
        fi
    done
    log_success "외부 레지스트리 이미지 프로비저닝 완료."
else
    log_info "이미지 다운로드 단계 생략 (--skip-pull / --skip-build)."
fi

# ------------------------------------------------------------------------------
# [Step 3] 데이터베이스 부트스트랩 및 관리자 계정 생성
# ------------------------------------------------------------------------------
echo ""
echo -e "${BOLD}================================================================${NC}"
echo -e "${BOLD}🗄️  [Step 3] DB 부트스트랩 & 초기 슈퍼관리자 계정 발급${NC}"
echo -e "${BOLD}================================================================${NC}"

log_info "PostgreSQL 및 Redis 서비스 기동 중..."
docker compose -f "${TARGET_DIR}/docker-compose.standalone.yml" up -d postgres redis

log_info "PostgreSQL 준비 상태 프로빙 (pg_isready)..."
MAX_RETRIES=20
COUNT=0
until docker compose -f "${TARGET_DIR}/docker-compose.standalone.yml" exec -T postgres pg_isready -U postgres -d ordinatio_db &> /dev/null || [ $COUNT -ge $MAX_RETRIES ]; do
    sleep 2
    COUNT=$((COUNT+1))
    echo -n "."
done
echo ""

if [ $COUNT -ge $MAX_RETRIES ]; then
    log_error "PostgreSQL 시작 타임아웃 발생."
    exit 1
fi
log_success "데이터베이스 정상 연결 확인."

# 기존 데이터 볼륨과 신규 .env 간의 패스워드 불일치 방지 (로컬 소켓 기반 동기화)
docker compose -f "${TARGET_DIR}/docker-compose.standalone.yml" exec -T postgres psql -U postgres -d postgres -c "ALTER USER postgres WITH PASSWORD '${DYN_POSTGRES_PASS}';" &> /dev/null || true

# 슈퍼관리자 비밀번호 결정
ADMIN_PASS="${ADMIN_PASSWORD:-${INITIAL_ADMIN_PASSWORD:-}}"
if [ -z "$ADMIN_PASS" ]; then
    ADMIN_PASS="Orche!$(openssl rand -hex 6)"
fi

log_info "초기 슈퍼관리자 계정 생성 (${INITIAL_ADMIN_EMAIL})..."
docker compose -f "${TARGET_DIR}/docker-compose.standalone.yml" run --rm --no-deps -e SEED_DEMO_DATA="${SEED_DEMO_DATA}" backend \
    python -m app.scripts.init_admin \
    --username "${INITIAL_ADMIN_USERNAME}" \
    --full-name "시스템 최고관리자" \
    --email "${INITIAL_ADMIN_EMAIL}" \
    --password "$ADMIN_PASS"

log_success "슈퍼관리자 계정(Argon2id 솔트 해싱) 발급 완료."

# ------------------------------------------------------------------------------
# [Step 4] Systemd 서비스 등록 및 헬스 무결성 검증 (DoD)
# ------------------------------------------------------------------------------
echo ""
echo -e "${BOLD}================================================================${NC}"
echo -e "${BOLD}🚀 [Step 4] Systemd 서비스 등록 & 최종 무결성 검증 (DoD)${NC}"
echo -e "${BOLD}================================================================${NC}"

# 호스트 관리 CLI 배치
cp "${SOURCE_DIR}/deploy/standalone/ordinatio-ctl" "${TARGET_DIR}/bin/ordinatio-ctl"
chmod +x "${TARGET_DIR}/bin/ordinatio-ctl"
ln -sf "${TARGET_DIR}/bin/ordinatio-ctl" /usr/local/bin/ordinatio-ctl
log_success "호스트 관리 도구(/usr/local/bin/ordinatio-ctl) 등록 완료."

# Systemd 유닛 파일 생성
cat << EOF > /etc/systemd/system/ordinatio.service
[Unit]
Description=Ordinatio Standalone Appliance
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${TARGET_DIR}
ExecStart=/usr/bin/docker compose -f docker-compose.standalone.yml up -d
ExecStop=/usr/bin/docker compose -f docker-compose.standalone.yml down
ExecReload=/usr/bin/docker compose -f docker-compose.standalone.yml restart

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ordinatio.service
log_success "Systemd 서비스(ordinatio.service) 활성화 완료."

# 전체 스택 기동 (신규 설치 및 재설치 환경 모두 대응)
log_info "Standalone 5대 전 서비스 스택 기동 중..."
systemctl restart ordinatio.service

# 헬스 프로빙 대기
log_info "서비스 엔드포인트 헬스 프로빙 대기 중..."
sleep 5

# 3대 핵심 헬스 검증
log_info "1) Backend REST API 헬스 확인 (http://localhost:${BACKEND_PORT}/api/v1/health)..."
for i in {1..15}; do
    if curl -sf "http://localhost:${BACKEND_PORT}/api/v1/health" &> /dev/null || curl -sf "http://localhost:${BACKEND_PORT}/health" &> /dev/null; then
        log_success "Backend Control Plane: READY (HTTP 200)"
        break
    fi
    sleep 2
done

log_info "2) Envoy L7 Gateway 헬스 확인 (http://localhost:${ENVOY_ADMIN_PORT}/ready)..."
for i in {1..10}; do
    if curl -sf "http://localhost:${ENVOY_ADMIN_PORT}/ready" &> /dev/null; then
        log_success "Envoy AI Gateway: READY (LIVE)"
        break
    fi
    sleep 2
done

log_info "3) Admin Web Frontend 헬스 확인 (http://localhost:${FRONTEND_PORT}/)..."
for i in {1..10}; do
    if curl -sf -o /dev/null -w "%{http_code}" "http://localhost:${FRONTEND_PORT}/" | grep -q "200"; then
        log_success "Frontend Admin Portal: READY (HTTP 200)"
        break
    fi
    sleep 2
done

# ------------------------------------------------------------------------------
# 설치 완료 요약 안내
# ------------------------------------------------------------------------------
echo ""
echo -e "${GREEN}${BOLD}================================================================${NC}"
echo -e "${GREEN}${BOLD}🎉 Ordinatio Standalone 어플라이언스 설치 완료!${NC}"
echo -e "${GREEN}${BOLD}================================================================${NC}"
echo ""
echo -e "  🌐 ${BOLD}어드민 웹 콘솔:${NC}       http://<호스트-IP>:${FRONTEND_PORT}"
echo -e "  ⚙️  ${BOLD}백엔드 REST API:${NC}      http://<호스트-IP>:${BACKEND_PORT}"
echo -e "  🚪 ${BOLD}Envoy AI Gateway:${NC}     http://<호스트-IP>:${ENVOY_TRAFFIC_PORT}"
echo -e "  📊 ${BOLD}Envoy 관리 콘솔:${NC}     http://<호스트-IP>:${ENVOY_ADMIN_PORT}/stats"
echo ""
echo -e "  🔐 ${BOLD}[초기 슈퍼관리자 접속 정보]${NC}"
echo -e "     • 아이디:   ${CYAN}${INITIAL_ADMIN_EMAIL}${NC} (또는 ${INITIAL_ADMIN_USERNAME})"
echo -e "     • 비밀번호: ${YELLOW}${ADMIN_PASS}${NC}"
echo ""
echo -e "  🛠️  ${BOLD}[호스트 관리 명령어]${NC}"
echo -e "     • 상태 조회: ${CYAN}ordinatio-ctl status${NC}"
echo -e "     • 로그 확인: ${CYAN}ordinatio-ctl logs -f${NC}"
echo -e "     • 스택 제어: ${CYAN}ordinatio-ctl start | stop | restart${NC}"
echo -e "     • 진단 검증: ${CYAN}ordinatio-ctl verify${NC}"
echo ""
echo -e "${GREEN}================================================================${NC}"
exit 0
