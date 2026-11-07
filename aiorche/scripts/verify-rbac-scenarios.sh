#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=========================================================="
echo "🛡️  AI Orchestrator RBAC Full Scenario Verification (API + UI)"
echo "=========================================================="

cd "${ROOT_DIR}"
echo "==> [1/2] Running RBAC API Scenario Suite (193 checks)..."
uv run --project backend python scripts/rbac/rbac_api_scenario.py

echo ""
echo "==> [2/2] Running RBAC UI (Headless Chrome CDP) E2E Scenario Suite (80 checks)..."
uv run --project backend python scripts/rbac/rbac_ui_scenario.py

echo ""
echo "✅ All RBAC API (193/193) & UI (80/80) scenarios passed (273/273 PASS)!"

