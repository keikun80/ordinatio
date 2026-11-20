#!/usr/bin/env bash
# ==============================================================================
# Ordinatio Multipass Setup & Preflight Inspector
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/mp-common.sh"

echo -e "${BOLD}${CYAN}======================================================================${NC}"
echo -e "${BOLD}${CYAN}🔍 [Multipass Preflight] Multipass 호스트 가상화 환경 검사${NC}"
echo -e "${BOLD}${CYAN}======================================================================${NC}"

check_multipass

MP_VER=$(mp_cmd version)
echo -e "${GREEN}✔ Multipass 바이너리 확인:${NC} ${MP_BIN}"
echo -e "${GREEN}✔ Multipass 버전:${NC}\n${MP_VER}"

echo -e "\n${BOLD}현재 활성화된 가상머신 인스턴스 목록:${NC}"
mp_cmd list || true

echo -e "\n${GREEN}✔ [PASS] Multipass 환경이 정상적으로 준비되었습니다.${NC}"
