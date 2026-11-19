#!/usr/bin/env bash
# ==============================================================================
# Ordinatio Standalone Appliance Uninstaller
# Single-Host Self-Contained Deployment Engine - Uninstallation Wrapper
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_SCRIPT="${SCRIPT_DIR}/install.sh"

if [ ! -f "$INSTALL_SCRIPT" ]; then
    # 대체 경로 탐색
    if [ -f "/opt/ordinatio/deploy/standalone/install.sh" ]; then
        INSTALL_SCRIPT="/opt/ordinatio/deploy/standalone/install.sh"
    fi
fi

if [ -f "$INSTALL_SCRIPT" ]; then
    exec bash "$INSTALL_SCRIPT" --uninstall "$@"
else
    echo -e "\033[0;31m[ERROR]\033[0m install.sh 스크립트를 찾을 수 없습니다: ${INSTALL_SCRIPT}" >&2
    exit 1
fi
