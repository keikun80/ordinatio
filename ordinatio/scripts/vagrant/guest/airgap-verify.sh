#!/usr/bin/env bash
# ==============================================================================
# [Guest] 폐쇄망 설치 결과 검증 (systemd · 컨테이너 · 엔드포인트 · 송신 차단 · E2E)
#
# 사용법: sudo bash airgap-verify.sh [--skip-e2e] [--admin-password PWD]
# ==============================================================================
set -uo pipefail

SKIP_E2E=false
ADMIN_PASSWORD="admin1234!"
while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-e2e) SKIP_E2E=true; shift ;;
        --admin-password) ADMIN_PASSWORD="$2"; shift 2 ;;
        *) echo "알 수 없는 옵션: $1" >&2; exit 2 ;;
    esac
done

GUEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_ROOT="$(cd "${GUEST_DIR}/../../.." && pwd)"
PASS=0
FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✔ PASS: $1"; }
ng()   { FAIL=$((FAIL+1)); echo "  ✖ FAIL: $1"; }

wait_http() {
    local url="$1" tries="${2:-30}"
    for _ in $(seq 1 "$tries"); do
        curl -sf -o /dev/null "$url" && return 0
        sleep 2
    done
    return 1
}

echo "==> [V1] systemd 서비스"
if systemctl is-active --quiet ordinatio.service; then ok "ordinatio.service active"; else ng "ordinatio.service inactive"; fi
if systemctl is-enabled --quiet ordinatio.service; then ok "ordinatio.service enabled (부팅 자동 시작)"; else ng "ordinatio.service not enabled"; fi

echo "==> [V2] 컨테이너 5종 가동 및 헬스"
for c in ordinatio-postgres ordinatio-redis ordinatio-envoy ordinatio-backend ordinatio-frontend; do
    state=""
    for _ in $(seq 1 30); do
        state="$(docker inspect -f '{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$c" 2>/dev/null || echo missing)"
        case "$state" in running/healthy|running/none) break ;; esac
        sleep 2
    done
    case "$state" in
        running/healthy|running/none) ok "${c} (${state})" ;;
        *) ng "${c} (${state})" ;;
    esac
done

echo "==> [V3] 이미지 출처 (오프라인 로드 이미지만 사용)"
docker images --format '    {{.Repository}}:{{.Tag}}  {{.ID}}  {{.Size}}'
for c in ordinatio-backend ordinatio-frontend; do
    img="$(docker inspect -f '{{.Config.Image}}' "$c" 2>/dev/null || echo '?')"
    echo "    • ${c} → ${img}"
done

echo "==> [V4] 서비스 엔드포인트"
wait_http "http://127.0.0.1:8000/api/v1/health" && ok "Backend API  :8000/api/v1/health" || ng "Backend API  :8000/api/v1/health"
wait_http "http://127.0.0.1:5173/"              && ok "Frontend     :5173/"              || ng "Frontend     :5173/"
wait_http "http://127.0.0.1:9901/ready"         && ok "Envoy Admin  :9901/ready"         || ng "Envoy Admin  :9901/ready"
gw_code="$(curl -s -o /dev/null -w '%{http_code}' -m 10 http://127.0.0.1:8080/v1/models || echo 000)"
# 인증 없는 호출이므로 401/403 도 게이트웨이 정상 응답으로 간주 (5xx/000 은 실패)
if [[ "$gw_code" =~ ^(200|401|403)$ ]]; then ok "Envoy Gateway :8080/v1/models (HTTP ${gw_code})"; else ng "Envoy Gateway :8080/v1/models (HTTP ${gw_code})"; fi

login_body="$(curl -s -m 10 -H 'Content-Type: application/json' \
    -d "{\"username\":\"admin\",\"password\":\"${ADMIN_PASSWORD}\"}" \
    http://127.0.0.1:8000/api/v1/auth/login || true)"
if echo "$login_body" | grep -q '"access_token"'; then ok "슈퍼관리자 로그인 (JWT 발급)"; else ng "슈퍼관리자 로그인 실패: ${login_body:0:200}"; fi

echo "==> [V5] 설치 후 외부 송신 차단 유지 (호스트 + 컨테이너)"
if bash "${GUEST_DIR}/airgap-enforce.sh" --check-only; then ok "Air-Gap 송신 차단 유지"; else ng "Air-Gap 송신 차단 실패"; fi

if [ "$SKIP_E2E" = false ]; then
    echo "==> [V6] 8대 전 메뉴 통합 E2E 시나리오"
    if python3 "${SRC_ROOT}/scripts/verify_all_menus_integration_scenario.py"; then
        ok "verify_all_menus_integration_scenario.py"
    else
        ng "verify_all_menus_integration_scenario.py"
    fi
else
    echo "==> [V6] E2E 시나리오 생략 (--skip-e2e)"
fi

echo ""
echo "======================================================================"
echo "  Air-Gap Standalone 검증 결과: PASS ${PASS} / FAIL ${FAIL}"
echo "======================================================================"
[ "$FAIL" -eq 0 ]
