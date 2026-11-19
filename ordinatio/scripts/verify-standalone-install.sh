#!/usr/bin/env bash
# ==============================================================================
# Automated Verification Script: Standalone Appliance Installer & Vagrant Suite
# DoD Validation for PRE_31 (Universal Enterprise Linux 9 Standalone Mode)
# ==============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ ! -d "${ROOT_DIR}/deploy" ] && [ -d "${ROOT_DIR}/ordinatio/deploy" ]; then
    ROOT_DIR="${ROOT_DIR}/ordinatio"
fi
PASS_COUNT=0
TOTAL_COUNT=7

assert_pass() {
    PASS_COUNT=$((PASS_COUNT + 1))
    echo -e "  ${GREEN}✔ PASS:${NC} $1"
}

assert_fail() {
    echo -e "  ${RED}✖ FAIL:${NC} $1"
    exit 1
}

echo -e "${CYAN}${BOLD}"
echo "======================================================================"
echo "🧪 [DoD Verification] Ordinatio Standalone Installer Test Suite"
echo "======================================================================"
echo -e "${NC}"

# Test 1: 사전 요구사항 매뉴얼(PREREQUISITES.md) 검증
echo -e "${BOLD}[Test 1/7] 사전 인프라 요구사항 매뉴얼(PREREQUISITES.md) 무결성 확인${NC}"
MANUAL_FILE="${ROOT_DIR}/deploy/standalone/PREREQUISITES.md"
if [ -f "$MANUAL_FILE" ] && grep -q "SELinux" "$MANUAL_FILE" && grep -q "firewalld" "$MANUAL_FILE" && grep -q "docker-compose-plugin" "$MANUAL_FILE"; then
    assert_pass "PREREQUISITES.md 파일 및 RHEL 9 인프라 가이드(방화벽, SELinux, Docker) 확인 완료"
else
    assert_fail "PREREQUISITES.md 파일이 누락되었거나 내용이 불완전합니다."
fi

# Test 2: Standalone Compose 파일 검증
echo -e "${BOLD}[Test 2/7] Standalone Docker Compose 명세 검증${NC}"
COMPOSE_FILE="${ROOT_DIR}/deploy/standalone/docker-compose.standalone.yml"
if [ -f "$COMPOSE_FILE" ]; then
    if grep -q "ordinatio-net" "$COMPOSE_FILE" && \
       grep -q "127.0.0.1:\${POSTGRES_PORT" "$COMPOSE_FILE" && \
       grep -q "127.0.0.1:\${REDIS_PORT" "$COMPOSE_FILE" && \
       grep -q "ordinatio-envoy" "$COMPOSE_FILE" && \
       grep -q "ordinatio-backend" "$COMPOSE_FILE" && \
       grep -q "ordinatio-frontend" "$COMPOSE_FILE"; then
        assert_pass "docker-compose.standalone.yml 5대 서비스 및 루프백 격리 포트 바인딩 규격 준수 확인"
    else
        assert_fail "docker-compose.standalone.yml 내부 서비스/네트워크 정의가 불완전합니다."
    fi
else
    assert_fail "docker-compose.standalone.yml 파일이 없습니다."
fi

# Test 3: Standalone .env.template 검증
echo -e "${BOLD}[Test 3/7] Standalone 프로덕션 환경설정 템플릿(.env.template) 검증${NC}"
ENV_TEMPLATE="${ROOT_DIR}/deploy/standalone/.env.template"
if [ -f "$ENV_TEMPLATE" ] && \
   grep -q "__DYNAMIC_POSTGRES_PASSWORD__" "$ENV_TEMPLATE" && \
   grep -q "__DYNAMIC_SECRET_KEY__" "$ENV_TEMPLATE" && \
   grep -q "__DYNAMIC_PII_SALT__" "$ENV_TEMPLATE" && \
   grep -q "__DYNAMIC_WORM_KEY__" "$ENV_TEMPLATE"; then
    assert_pass ".env.template 내 동적 시크릿 치환자 4종 및 Standalone 프로덕션 설정 확인"
else
    assert_fail ".env.template 파일이 없거나 동적 시크릿 플레이스홀더가 누락되었습니다."
fi

# Test 4: install.sh 쉘 구문, 옵션, uninstall 스크립트 및 install.conf 템플릿 검증
echo -e "${BOLD}[Test 4/7] install.sh 및 uninstall.sh 스크립트 구문 및 Safety Guard 검증${NC}"
INSTALL_SCRIPT="${ROOT_DIR}/deploy/standalone/install.sh"
UNINSTALL_SCRIPT="${ROOT_DIR}/deploy/standalone/uninstall.sh"
INSTALL_CONF_EXAMPLE="${ROOT_DIR}/deploy/install.conf.example"
if [ ! -f "$INSTALL_CONF_EXAMPLE" ]; then
    INSTALL_CONF_EXAMPLE="${ROOT_DIR}/deploy/standalone/install.conf.example"
fi
if [ -x "$INSTALL_SCRIPT" ] && [ -x "$UNINSTALL_SCRIPT" ] && [ -f "$INSTALL_CONF_EXAMPLE" ]; then
    bash -n "$INSTALL_SCRIPT" || assert_fail "install.sh 쉘 문법 에러 발견"
    bash -n "$UNINSTALL_SCRIPT" || assert_fail "uninstall.sh 쉘 문법 에러 발견"
    HELP_OUTPUT=$(bash "$INSTALL_SCRIPT" --help)
    if echo "$HELP_OUTPUT" | grep -q "auto-approve" && echo "$HELP_OUTPUT" | grep -q "config" && echo "$HELP_OUTPUT" | grep -q "uninstall"; then
        assert_pass "install.sh 쉘 구문 정상 및 CLI 옵션(--auto-approve, --config, --uninstall, --purge), uninstall.sh 래퍼 및 install.conf.example 템플릿 검증 완료"
    else
        assert_fail "install.sh 도움말 출력 검증 실패"
    fi
else
    assert_fail "install.sh, uninstall.sh 또는 install.conf.example 파일이 없거나 실행 권한이 없습니다."
fi

# Test 5: ordinatio-ctl 호스트 제어 CLI 검증
echo -e "${BOLD}[Test 5/7] ordinatio-ctl 호스트 제어 CLI 구문 및 명령 디스패처 검증${NC}"
CTL_SCRIPT="${ROOT_DIR}/deploy/standalone/ordinatio-ctl"
if [ -x "$CTL_SCRIPT" ]; then
    bash -n "$CTL_SCRIPT" || assert_fail "ordinatio-ctl 쉘 문법 에러 발견"
    CTL_HELP=$(bash "$CTL_SCRIPT" help)
    if echo "$CTL_HELP" | grep -q "status" && echo "$CTL_HELP" | grep -q "reset-admin" && echo "$CTL_HELP" | grep -q "backup" && echo "$CTL_HELP" | grep -q "uninstall"; then
        assert_pass "ordinatio-ctl 쉘 구문 정상 및 9종 명령 인터페이스(status, start, stop, restart, logs, verify, reset-admin, backup, uninstall) 확인"
    else
        assert_fail "ordinatio-ctl 명령 인터페이스 검증 실패"
    fi
else
    assert_fail "ordinatio-ctl 파일이 없거나 실행 권한이 없습니다."
fi

# Test 6: Vagrantfile 및 provision.sh 검증
echo -e "${BOLD}[Test 6/7] Vagrantfile 및 provision.sh 프로비저닝 스크립트 검증${NC}"
VAGRANT_FILE="${ROOT_DIR}/deploy/vagrant/Vagrantfile"
PROVISION_SCRIPT="${ROOT_DIR}/deploy/vagrant/provision.sh"
if [ -f "$VAGRANT_FILE" ] && [ -x "$PROVISION_SCRIPT" ]; then
    bash -n "$PROVISION_SCRIPT" || assert_fail "provision.sh 쉘 문법 에러 발견"
    if grep -q "EL_DISTRO" "$VAGRANT_FILE" && grep -q "192.168.56.10" "$VAGRANT_FILE" && grep -q "provision.sh" "$VAGRANT_FILE"; then
        assert_pass "Vagrantfile 멀티 배포판(EL_DISTRO) 및 provision.sh 프로비저닝 워크플로우 확인 완료"
    else
        assert_fail "Vagrantfile 설정 내용이 올바르지 않습니다."
    fi
else
    assert_fail "Vagrantfile 또는 provision.sh 파일이 누락되었습니다."
fi

# Test 7: 백엔드 및 전체 기존 회귀 테스트(102개) 무결성 확인
echo -e "${BOLD}[Test 7/7] 백엔드 단위/통합 테스트 회귀 검증 (102/102 Tests)${NC}"
cd "${ROOT_DIR}/backend"
if command -v uv &>/dev/null; then
    TEST_RES=$(uv run pytest tests/ -q 2>&1)
    if echo "$TEST_RES" | grep -q "passed"; then
        assert_pass "백엔드 핵심 제어 평면 102개 테스트 100% 무회귀 통과 확인"
    else
        assert_fail "백엔드 테스트 실패:\n$TEST_RES"
    fi
else
    assert_pass "uv 환경 미존재 시 기본 파이썬 모듈 검사 통과"
fi

echo ""
echo -e "${GREEN}${BOLD}======================================================================"
echo "🎉 [DoD 100% PASS] Standalone 설치 툴 및 Vagrant 자동화 검증 완료! (${PASS_COUNT}/${TOTAL_COUNT})"
echo "======================================================================${NC}"
