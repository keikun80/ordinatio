#!/usr/bin/env bash
# ==============================================================================
# Ordinatio Multipass Teardown & Instance Purge
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/mp-common.sh"

echo -e "${BOLD}${YELLOW}🧹 [Multipass Teardown] Ordinatio 테스트 인스턴스 정리 및 회수...${NC}"

INSTANCES=("ordinatio-standalone" "ordinatio-isolated-test" "ordinatio-k8s" "ordinatio-airgap")

for inst in "${INSTANCES[@]}"; do
    if mp_cmd list 2>/dev/null | grep -q "^${inst}[[:space:]]"; then
        echo -e "  • 인스턴스 정지 및 삭제: ${inst}..."
        mp_cmd stop "${inst}" 2>/dev/null || true
        mp_cmd delete "${inst}" 2>/dev/null || true
    fi
done

echo -e "  • 영구 폐기 (purge)..."
mp_cmd purge 2>/dev/null || true

echo -e "${GREEN}✔ [DONE] 모든 Ordinatio Multipass 테스트 인스턴스가 안전하게 회수되었습니다.${NC}"
