#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo "🧪 AI Orchestrator All Menus Integrated E2E Scenario Audit"
echo "  [8대 전 메뉴 활용 & 실시간 텔레메트리 종합 모니터링 검증]"
echo "=========================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# 1. Check Python runner script exists
if [[ ! -f "${SCRIPT_DIR}/verify_all_menus_integration_scenario.py" ]]; then
    echo "❌ Missing runner script: ${SCRIPT_DIR}/verify_all_menus_integration_scenario.py"
    exit 1
fi

# 2. Execute Python integrated scenario against running stack
echo "==> Executing 10-step full operational workflow..."
python3 "${SCRIPT_DIR}/verify_all_menus_integration_scenario.py" "$@"

echo "=========================================================="
echo "🎉 SUCCESS: All 8 Menus Integrated Test Scenario 100% Passed!"
