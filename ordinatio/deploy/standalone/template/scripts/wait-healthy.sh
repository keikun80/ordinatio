#!/usr/bin/env bash
# ==============================================================================
# Healthcheck Monitor & Automatic Admin Bootstrap
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

SERVICES=("ordinatio-postgres" "ordinatio-redis" "ordinatio-backend" "ordinatio-envoy" "ordinatio-frontend")
MAX_WAIT_SECONDS=60
START_TIME=$(date +%s)

echo "==> Waiting for 5 appliance services to achieve healthy state..."

for svc in "${SERVICES[@]}"; do
    printf "  • Checking %-20s " "${svc}..."
    while true; do
        STATUS=$(docker inspect --format='{{json .State.Health.Status}}' "${svc}" 2>/dev/null || echo '"unknown"')
        if [ "${STATUS}" = '"healthy"' ]; then
            echo -e "\033[0;32m[HEALTHY]\033[0m"
            break
        fi

        CURRENT_TIME=$(date +%s)
        ELAPSED=$((CURRENT_TIME - START_TIME))
        if [ ${ELAPSED} -ge ${MAX_WAIT_SECONDS} ]; then
            echo -e "\033[0;31m[TIMEOUT]\033[0m"
            echo "❌ Service ${svc} did not become healthy within ${MAX_WAIT_SECONDS}s."
            echo "   Recent container logs:"
            docker logs "${svc}" --tail=20
            exit 1
        fi
        sleep 2
    done
done

# Bootstrapping initial admin account
echo "==> Bootstrapping initial admin account inside container..."
docker exec ordinatio-backend python -m app.scripts.init_admin >/dev/null 2>&1 || true

# Extract host IP or fallback
HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
if [ -z "${HOST_IP}" ]; then
    HOST_IP="localhost"
fi

FRONTEND_PORT=$(grep '^FRONTEND_PORT=' "${APP_DIR}/.env" 2>/dev/null | cut -d'=' -f2 || echo "5173")
ENVOY_PORT=$(grep '^ENVOY_PORT=' "${APP_DIR}/.env" 2>/dev/null | cut -d'=' -f2 || echo "8080")
BACKEND_PORT=$(grep '^BACKEND_PORT=' "${APP_DIR}/.env" 2>/dev/null | cut -d'=' -f2 || echo "8000")
ADMIN_USER=$(grep '^INITIAL_ADMIN_USERNAME=' "${APP_DIR}/.env" 2>/dev/null | cut -d'=' -f2 || echo "admin")
ADMIN_PW=$(grep '^INITIAL_ADMIN_PASSWORD=' "${APP_DIR}/.env" 2>/dev/null | cut -d'=' -f2 || echo "admin1234!")

echo ""
echo "========================================================================"
echo "🎉 Ordinatio Appliance Successfully Started! (Air-Gapped)"
echo "========================================================================"
echo "  • Web Console (UI)    : http://${HOST_IP}:${FRONTEND_PORT}"
echo "  • L7 AI Gateway       : http://${HOST_IP}:${ENVOY_PORT}/v1"
echo "  • API Documentation   : http://127.0.0.1:${BACKEND_PORT}/docs"
echo "  • Initial Admin User  : ${ADMIN_USER}"
echo "  • Initial Password    : ${ADMIN_PW}"
echo "========================================================================"
echo "  Management Commands: make status | make logs | make down | make backup"
echo "========================================================================"

