#!/usr/bin/env bash
#
# UI 명세(PRE_23) ↔ 구현(data-testid) 드리프트 검사.
#
# PRE_23 의 SP 섹션이 구현과 전면 불일치했던 이력이 있어(존재하지 않는 testid/API 가 명세에만
# 기재되어 E2E 작성 근거로 쓸 수 없는 상태), 문서와 코드가 다시 벌어지는 것을 기계적으로 막는다.
#
# 검사 방향:
#   1) 명세에만 있고 구현에 없는 testid  -> ❌ 실패 (E2E 가 잡을 수 없는 유령 명세)
#   2) 구현에만 있고 명세에 없는 testid  -> ⚠️  경고 (명세 보강 필요, 실패로 처리하지 않음)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_DIR="$(cd "${ROOT_DIR}/.." && pwd)"

SPEC="${REPO_DIR}/architecture/06_ui_and_presentation/PRE_23_ui_taxonomy_and_element_specification.md"
COMPONENT="${ROOT_DIR}/frontend/src/components/SystemPromptsTab.jsx"

echo "=========================================================="
echo "🧭 UI Taxonomy Drift Audit (PRE_23 ↔ Implementation)"
echo "=========================================================="

FAILED=0

for f in "${SPEC}" "${COMPONENT}"; do
    if [[ ! -f "${f}" ]]; then
        echo "❌ Missing file: ${f}"
        exit 1
    fi
done

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

# --- 1. 구현에서 testid 추출 (템플릿 리터럴은 ${...} 를 와일드카드 토큰으로 정규화) ---
{
    grep -o 'data-testid="[^"]*"' "${COMPONENT}" | sed 's/data-testid="//; s/"$//'
    grep -o 'data-testid={`[^`]*`}' "${COMPONENT}" | sed 's/data-testid={`//; s/`}$//' | sed 's/\${[^}]*}/*/g'
} | sort -u > "${WORK}/impl.txt"

# --- 2. 명세의 SP 섹션에서 testid 추출 ---
# 3.4 절만 대상으로 하고, `sp-...-${id}` 형태는 동일하게 * 로 정규화한다.
awk '/^### 3\.4 \[SP\]/,/^### 3\.5 /' "${SPEC}" \
    | grep -o '`sp-[^`]*`' \
    | sed 's/`//g' \
    | sed 's/\${[^}]*}/*/g' \
    | tr '/' '\n' \
    | sed 's/^ *//; s/ *$//' \
    | grep -E '^sp-' \
    | sort -u > "${WORK}/spec.txt"

echo "  • 명세(PRE_23 §3.4) testid: $(wc -l < "${WORK}/spec.txt") 건"
echo "  • 구현(SystemPromptsTab.jsx) testid: $(wc -l < "${WORK}/impl.txt") 건"
echo ""

# --- 3. 명세에만 존재 (유령 명세) -> 실패 ---
GHOSTS="$(comm -23 "${WORK}/spec.txt" "${WORK}/impl.txt" || true)"
if [[ -n "${GHOSTS}" ]]; then
    echo "❌ 명세에만 존재하고 구현에 없는 testid (E2E 작성 불가):"
    echo "${GHOSTS}" | sed 's/^/     - /'
    FAILED=1
else
    echo "  ✅ 명세에 기재된 모든 testid 가 구현에 존재합니다."
fi

# --- 4. 구현에만 존재 (명세 미기재) -> 경고 ---
UNDOCUMENTED="$(comm -13 "${WORK}/spec.txt" "${WORK}/impl.txt" || true)"
if [[ -n "${UNDOCUMENTED}" ]]; then
    echo ""
    echo "⚠️  구현에만 존재하고 명세에 없는 testid (명세 보강 권장):"
    echo "${UNDOCUMENTED}" | sed 's/^/     - /'
fi

# --- 5. 명세에 기재된 SP 백엔드 엔드포인트가 실제 라우터에 존재하는지 교차 검증 ---
echo ""
echo "==> SP 백엔드 엔드포인트 교차 검증..."
ENDPOINT_SRC="${ROOT_DIR}/backend/app/api/v1/endpoints/system_prompts.py"
awk '/^### 3\.4 \[SP\]/,/^### 3\.5 /' "${SPEC}" \
    | grep -oE '`(GET|POST|PUT|DELETE|GET/POST/PUT) /api/v1/system-prompts[^`]*`' \
    | sed 's/`//g' | sort -u > "${WORK}/spec_api.txt"

while IFS= read -r line; do
    [[ -z "${line}" ]] && continue
    # '/api/v1/system-prompts' 접두를 제거하고 경로 파라미터를 정규화하여 라우터 데코레이터와 대조
    path="${line#* }"
    sub="${path#/api/v1/system-prompts}"
    sub="$(echo "${sub}" | sed 's/{[^}]*}/{P}/g; s/?.*$//')"
    if [[ -z "${sub}" ]]; then
        continue  # 컬렉션 루트는 항상 존재
    fi
    pattern="$(echo "${sub}" | sed 's/{P}/{[a-z_]*}/g')"
    if ! grep -qE "@router\.(get|post|put|delete)\(\s*\"?${pattern}\"?" "${ENDPOINT_SRC}" \
       && ! grep -qE "\"${pattern}\"" "${ENDPOINT_SRC}"; then
        echo "❌ 명세에 기재된 엔드포인트가 라우터에 없습니다: ${line}"
        FAILED=1
    fi
done < "${WORK}/spec_api.txt"

if [[ $FAILED -eq 0 ]]; then
    echo "  ✅ 명세의 SP 엔드포인트가 모두 라우터에 존재합니다."
fi

echo ""
echo "=========================================================="
if [[ $FAILED -ne 0 ]]; then
    echo "❌ UI Taxonomy Drift Audit FAILED!"
    echo "=========================================================="
    exit 1
fi
echo "🎉 UI Taxonomy Drift Audit PASSED!"
echo "=========================================================="
