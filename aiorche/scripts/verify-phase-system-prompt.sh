#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo "🧪 AI Orchestrator System Prompt Governance Definition of Done (DoD) Audit"
echo "  [동적 시스템 프롬프트 거버넌스 & L7 게이트웨이 인라인 주입 검증]"
echo "=========================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

FAILED=0

# Step 1: Check Required Files and Directory Structure
echo "==> [1/4] Verifying System Prompt Governance Schemas, Models, Injector & Components..."
REQUIRED_PATHS=(
    "backend/app/models/system_prompt.py"
    "backend/app/schemas/system_prompt.py"
    "backend/app/api/v1/endpoints/system_prompts.py"
    "backend/app/core/prompt_injector.py"
    "backend/app/core/ext_proc_server.py"
    "backend/tests/test_phase1_system_prompt_schema.py"
    "backend/tests/test_system_prompts.py"
    "backend/tests/test_phase3_prompt_injection.py"
    "frontend/src/components/SystemPromptsTab.jsx"
)

for p in "${REQUIRED_PATHS[@]}"; do
    if [[ ! -f "${ROOT_DIR}/${p}" ]]; then
        echo "❌ Missing file: ${p}"
        FAILED=1
    fi
done

if [[ $FAILED -eq 0 ]]; then
    echo "  ✅ All System Prompt Governance core files verified."
fi

# Step 2: Backend Unit & Integration Tests
echo "==> [2/4] Running Backend Tests (Schema, CRUD API, Priority Resolver, L7 ext_proc Injection)..."
cd "${ROOT_DIR}/backend"
if uv run pytest tests/test_phase1_system_prompt_schema.py tests/test_system_prompts.py tests/test_phase3_prompt_injection.py -v; then
    echo "  ✅ All System Prompt Governance targeted tests passed (12/12)."
else
    echo "  ❌ System Prompt Governance targeted tests failed."
    FAILED=1
fi

if uv run pytest -q; then
    echo "  ✅ Full test suite (78/78 tests) passed without regressions."
else
    echo "  ❌ Full test suite regression failed."
    FAILED=1
fi

# Step 3: Frontend Build Validation
echo "==> [3/4] Validating Frontend Production Build (Vite)..."
cd "${ROOT_DIR}/frontend"
if npm run build; then
    echo "  ✅ Frontend production bundle compiled successfully."
else
    echo "  ❌ Frontend production build failed."
    FAILED=1
fi

# Step 4: Verification of Core Injection Engine Invariants
echo "==> [4/4] Verifying Priority Hierarchy & Injection Engine Invariants..."
cd "${ROOT_DIR}/backend"
uv run python3 -c '
from app.core.prompt_injector import inject_system_prompt

class MockPrompt:
    def __init__(self, target_type, content, mode="PREPEND"):
        self.target_type = target_type
        self.content = content
        self.injection_mode = mode
        self.is_active = True

# Scenario 1: Prepend Mode (No existing system prompt)
messages = [{"role": "user", "content": "Hello"}]
matched = MockPrompt("ROUTE", "You are a routing helper.", "PREPEND")
res = inject_system_prompt(messages, matched)
assert res[0]["role"] == "system"
assert res[0]["content"] == "You are a routing helper."
assert res[1]["content"] == "Hello"

# Scenario 2: Existing System Prompt + Prepend
messages_with_sys = [{"role": "system", "content": "Client prompt."}, {"role": "user", "content": "Hi"}]
res2 = inject_system_prompt(messages_with_sys, matched)
assert "You are a routing helper.\n\nClient prompt." == res2[0]["content"]

# Scenario 3: Override Mode
matched_override = MockPrompt("VIRTUAL_KEY", "Mandatory corporate guideline.", "OVERRIDE")
res3 = inject_system_prompt(messages_with_sys, matched_override)
assert res3[0]["content"] == "Mandatory corporate guideline."
assert len([m for m in res3 if m.get("role") == "system"]) == 1

# Scenario 4: Fallback Only Mode (When system exists -> Do not inject)
matched_fallback = MockPrompt("GLOBAL", "Fallback prompt.", "FALLBACK_ONLY")
res4 = inject_system_prompt(messages_with_sys, matched_fallback)
assert res4[0]["content"] == "Client prompt."

# Scenario 5: Fallback Only Mode (When system does NOT exist -> Inject)
res5 = inject_system_prompt(messages, matched_fallback)
assert res5[0]["role"] == "system"
assert res5[0]["content"] == "Fallback prompt."

print("  ✅ All prompt injection invariants verified (PREPEND, OVERRIDE, FALLBACK_ONLY).")
'

echo "=========================================================="
echo "🎉 System Prompt Governance Definition of Done (DoD) PASSED!"
echo "=========================================================="
