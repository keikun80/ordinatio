#!/usr/bin/env bash
# ==============================================================================
# Ordinatio Standalone 폐쇄망(Air-Gap) 설치 E2E 테스트 — Vagrant + VirtualBox
#
# 흐름:
#   1. Preflight     : vagrant/VBoxManage, 호스트 디스크, 서명 릴리스 번들 확인 (--build-release 시 생성)
#   2. Base Snapshot : 온라인 상태로 OS 패키지 + Docker만 구성 → VM 정지 → 스냅샷(ord-base-docker)
#                      (이미 존재하면 스냅샷으로 복원하여 매 회 클린 상태에서 시작)
#   3. Air-Gap       : 게스트 내부 iptables로 NAT 외부 송신 차단 + 차단 검증
#   4. Install       : 릴리스 반입 → SHA/RSA-4096 서명 검증 → 압축 해제 → install.sh --skip-pull
#   5. Verify        : systemd · 컨테이너 5종 · 엔드포인트 · 로그인 · 송신 차단 유지 · 8대 메뉴 E2E
#   6. (옵션) Reboot : vagrant reload 후 ordinatio.service 자동 기동 재검증
#   7. Teardown      : --keep(기본) / --restore / --destroy
#
# 산출 로그: ordinatio/logs/vagrant-airgap/<타임스탬프>.log
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
export VAGRANT_CWD="${ROOT_DIR}/deploy/vagrant"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

APP_VERSION="$(sed -nE 's/^[[:space:]]*VERSION:[[:space:]]*str[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' "${ROOT_DIR}/backend/app/core/config.py" | head -n 1)"
VERSION="${APP_VERSION}"
DISTRO="${OS_DISTRO:-bento/rockylinux-9}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin1234!}"
SNAPSHOT="ord-base-docker"
BUILD_RELEASE=false
RECREATE=false
REBOOT_TEST=false
SKIP_E2E=false
TEARDOWN="keep"
MIN_FREE_GB=15

usage() {
    cat <<EOF
사용법: $0 [OPTIONS]

Vagrant(VirtualBox) VM에서 외부망을 차단한 뒤 서명된 오프라인 번들로 Standalone 설치를 검증합니다.

옵션:
  -v, --version VER        검증할 릴리스 버전 (기본값: ${APP_VERSION}, dist/release/v<VER>)
      --build-release      호스트에서 번들 빌드 + 서명 (scripts/release-appliance.sh --rebuild, Docker 데몬 필요)
      --distro BOX         Vagrant 박스 (기본값: bento/rockylinux-9)
  -p, --admin-password PWD 슈퍼관리자 초기 비밀번호 (기본값: admin1234!)
      --recreate           기존 VM과 베이스 스냅샷을 폐기하고 새로 생성
      --reboot-test        설치 후 VM 재부팅하여 서비스 자동 기동 재검증
      --skip-e2e           8대 메뉴 E2E 시나리오 생략
      --keep               (기본) 테스트 후 VM 유지 — http://192.168.56.10:5173
      --restore            테스트 후 베이스 스냅샷으로 복원 (다음 회차 준비)
      --destroy            테스트 후 VM 완전 폐기
  -h, --help               도움말
EOF
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -v|--version) VERSION="$2"; shift 2 ;;
        --build-release) BUILD_RELEASE=true; shift ;;
        --distro) DISTRO="$2"; shift 2 ;;
        -p|--admin-password) ADMIN_PASSWORD="$2"; shift 2 ;;
        --recreate) RECREATE=true; shift ;;
        --reboot-test) REBOOT_TEST=true; shift ;;
        --skip-e2e) SKIP_E2E=true; shift ;;
        --keep) TEARDOWN="keep"; shift ;;
        --restore) TEARDOWN="restore"; shift ;;
        --destroy) TEARDOWN="destroy"; shift ;;
        -h|--help) usage ;;
        *) echo -e "${RED}알 수 없는 옵션: $1${NC}"; usage ;;
    esac
done

export OS_DISTRO="$DISTRO"
RELEASE_DIR="${ROOT_DIR}/dist/release/v${VERSION}"
GUEST_SRC="/opt/ordinatio-src"
GUEST_RELEASE_DIR="${GUEST_SRC}/dist/release/v${VERSION}"
GUEST_SCRIPTS="${GUEST_SRC}/scripts/vagrant/guest"
BOX_MARKER="${VAGRANT_CWD}/.vagrant/ordinatio-airgap-box"

LOG_DIR="${ROOT_DIR}/logs/vagrant-airgap"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/$(date +%Y%m%d-%H%M%S)-v${VERSION}-$(echo "$DISTRO" | tr '/' '_').log"
exec > >(tee -a "$LOG_FILE") 2>&1

START_TS=$(date +%s)
step() { echo -e "\n${BOLD}${CYAN}[$1] $2${NC}"; }
die()  { echo -e "${RED}❌ $*${NC}"; exit 1; }
vg()   { vagrant "$@"; }
gsh()  { vagrant ssh -c "$1" -- -o LogLevel=ERROR; }

machine_state() { vg status --machine-readable 2>/dev/null | awk -F, '$3=="state"{print $4; exit}'; }
has_snapshot()  { vg snapshot list 2>/dev/null | grep -Eq "(^|[[:space:]])${SNAPSHOT}([[:space:]]|$)"; }

echo -e "${BOLD}${CYAN}======================================================================${NC}"
echo -e "${BOLD}${CYAN}🛡️  Ordinatio Standalone Air-Gap 설치 테스트 (Vagrant + VirtualBox)${NC}"
echo -e "${BOLD}${CYAN}======================================================================${NC}"
echo "  • 릴리스 버전 : v${VERSION}  (${RELEASE_DIR})"
echo "  • Vagrant 박스: ${DISTRO}"
echo "  • 종료 처리   : ${TEARDOWN}   • 재부팅 검증: ${REBOOT_TEST}   • E2E 생략: ${SKIP_E2E}"
echo "  • 증적 로그   : ${LOG_FILE}"

# ------------------------------------------------------------------------------
step "1/6" "Preflight 점검"
command -v vagrant   &>/dev/null || die "vagrant 가 설치되어 있지 않습니다."
command -v VBoxManage &>/dev/null || die "VirtualBox(VBoxManage)가 설치되어 있지 않습니다."
echo "  ✔ $(vagrant --version), VirtualBox $(VBoxManage --version)"

FREE_GB=$(df -Pk "$ROOT_DIR" | awk 'NR==2 {printf "%d", $4/1024/1024}')
if [ "$FREE_GB" -lt "$MIN_FREE_GB" ]; then
    die "호스트 디스크 여유 공간 부족: ${FREE_GB}GB (최소 ${MIN_FREE_GB}GB 필요)"
fi
echo "  ✔ 호스트 디스크 여유: ${FREE_GB}GB"

if [ "$BUILD_RELEASE" = true ]; then
    docker info &>/dev/null || die "--build-release 에는 호스트 Docker 데몬이 필요합니다 (Docker Desktop 실행)."
    echo "  • 릴리스 번들 빌드 + RSA-4096 서명: scripts/release-appliance.sh --version ${VERSION} --rebuild"
    bash "${ROOT_DIR}/scripts/release-appliance.sh" --version "${VERSION}" --rebuild
fi
for f in "ordinatio-appliance-v${VERSION}.tar.gz" "ordinatio-appliance-v${VERSION}.tar.gz.sig" \
         "ordinatio-vendor-public.pem" "verify-release.sh"; do
    [ -f "${RELEASE_DIR}/${f}" ] || die "릴리스 산출물이 없습니다: ${RELEASE_DIR}/${f}\n   👉 --build-release 옵션으로 생성하십시오."
done
if ! tar -tzf "${RELEASE_DIR}/ordinatio-appliance-v${VERSION}.tar.gz" | grep -q 'deploy/standalone/install.sh$'; then
    die "번들에 deploy/standalone/install.sh 가 없습니다 (구버전 번들). --build-release 로 재생성하십시오."
fi
echo "  ✔ 서명 릴리스 번들 확인 ($(du -h "${RELEASE_DIR}/ordinatio-appliance-v${VERSION}.tar.gz" | cut -f1))"

# ------------------------------------------------------------------------------
step "2/6" "베이스 VM 준비 (온라인: OS 패키지 + Docker) → 스냅샷 ${SNAPSHOT}"
STATE="$(machine_state || true)"
if [ -n "$STATE" ] && [ "$STATE" != "not_created" ] && [ -f "$BOX_MARKER" ] && [ "$(cat "$BOX_MARKER")" != "$DISTRO" ]; then
    if [ "$RECREATE" = false ]; then
        die "기존 VM 박스($(cat "$BOX_MARKER"))가 요청 박스(${DISTRO})와 다릅니다. --recreate 를 지정하십시오."
    fi
fi
if [ "$RECREATE" = true ] && [ -n "$STATE" ] && [ "$STATE" != "not_created" ]; then
    echo "  • --recreate: 기존 VM 및 스냅샷 폐기"
    vg destroy -f
    STATE="not_created"
fi

if [ "$STATE" != "not_created" ] && [ -n "$STATE" ] && has_snapshot; then
    echo "  • 베이스 스냅샷 복원 (클린 상태로 회귀)"
    vg snapshot restore --no-provision "$SNAPSHOT"
else
    echo "  • 신규 VM 생성 및 사전 요구사항 프로비저닝 (ORD_PREREQ_ONLY=true, 수 분 소요)"
    if [ "$STATE" != "not_created" ] && [ -n "$STATE" ]; then
        vg destroy -f
    fi
    ORD_PREREQ_ONLY=true vg up --provision
    echo "$DISTRO" > "$BOX_MARKER"
    echo "  • VM 정지 후 베이스 스냅샷 저장 (메모리 상태 미포함 → 디스크 절약)"
    vg halt
    vg snapshot save "$SNAPSHOT"
    vg up --no-provision
fi
gsh "cat /etc/os-release | grep PRETTY_NAME; docker --version; docker compose version --short"

# ------------------------------------------------------------------------------
step "3/6" "외부 송신 차단 (Air-Gap) 적용 및 검증"
gsh "sudo bash ${GUEST_SCRIPTS}/airgap-enforce.sh"

# ------------------------------------------------------------------------------
step "4/6" "폐쇄망 오프라인 설치 (서명 검증 → install.sh --skip-pull)"
gsh "sudo bash ${GUEST_SCRIPTS}/airgap-install.sh '${GUEST_RELEASE_DIR}' '${ADMIN_PASSWORD}'"

# ------------------------------------------------------------------------------
step "5/6" "설치 결과 검증"
VERIFY_ARGS="--admin-password '${ADMIN_PASSWORD}'"
[ "$SKIP_E2E" = true ] && VERIFY_ARGS="${VERIFY_ARGS} --skip-e2e"
RESULT=0
gsh "sudo bash ${GUEST_SCRIPTS}/airgap-verify.sh ${VERIFY_ARGS}" || RESULT=1

if [ "$REBOOT_TEST" = true ] && [ $RESULT -eq 0 ]; then
    step "5b/6" "재부팅 후 서비스 자동 기동 재검증"
    vg reload --no-provision
    # iptables 규칙은 재부팅 시 소멸하므로 서비스 기동 확인 전 차단 재적용
    gsh "sudo bash ${GUEST_SCRIPTS}/airgap-enforce.sh"
    gsh "sudo bash ${GUEST_SCRIPTS}/airgap-verify.sh --skip-e2e --admin-password '${ADMIN_PASSWORD}'" || RESULT=1
fi

# ------------------------------------------------------------------------------
step "6/6" "종료 처리 (${TEARDOWN})"
case "$TEARDOWN" in
    restore) vg snapshot restore --no-provision "$SNAPSHOT" && vg halt ;;
    destroy) vg destroy -f && rm -f "$BOX_MARKER" ;;
    keep)
        echo "  • VM 유지: 웹 콘솔 http://192.168.56.10:5173 (또는 http://127.0.0.1:15173), admin / ${ADMIN_PASSWORD}"
        echo "  • 접속: VAGRANT_CWD=${VAGRANT_CWD} vagrant ssh"
        echo "  • 다음 회차: 본 스크립트 재실행 시 베이스 스냅샷으로 자동 복원" ;;
esac

DURATION=$(( $(date +%s) - START_TS ))
echo ""
if [ $RESULT -eq 0 ]; then
    echo -e "${BOLD}${GREEN}🎉 [PASS] Air-Gap Standalone 설치 테스트 통과 (v${VERSION}, ${DISTRO}, ${DURATION}s)${NC}"
else
    echo -e "${BOLD}${RED}❌ [FAIL] Air-Gap Standalone 설치 테스트 실패 (v${VERSION}, ${DISTRO}, ${DURATION}s)${NC}"
    echo "   • 로그: ${LOG_FILE}"
    echo "   • 진단: VAGRANT_CWD=${VAGRANT_CWD} vagrant ssh -c 'sudo journalctl -u ordinatio -n 100; sudo docker ps -a'"
fi
echo "  • 증적 로그: ${LOG_FILE}"
exit $RESULT
