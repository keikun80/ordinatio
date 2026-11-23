#!/usr/bin/env bash
# ==============================================================================
# Ordinatio Multipass Common Wrapper & Host Environment Resolver
# Supports: Windows 11 WSL2 (multipass.exe) & macOS / Linux Native (multipass)
# ==============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Resolve Multipass binary
MP_BIN=""
if command -v multipass &>/dev/null; then
    MP_BIN="multipass"
elif command -v multipass.exe &>/dev/null; then
    MP_BIN="multipass.exe"
elif [ -f "/mnt/c/Program Files/Multipass/bin/multipass.exe" ]; then
    MP_BIN="/mnt/c/Program Files/Multipass/bin/multipass.exe"
fi

check_multipass() {
    if [ -z "$MP_BIN" ]; then
        echo -e "${RED}❌ [ERROR] Canonical Multipass 실행 바이너리를 찾을 수 없습니다.${NC}"
        echo -e "${YELLOW}👉 호스트 OS에 맞게 Multipass를 설치해 주십시오:${NC}"
        echo -e "   • macOS:          brew install --cask multipass"
        echo -e "   • Windows 11:     winget install Canonical.Multipass"
        echo -e "   • Ubuntu / Linux: sudo snap install multipass"
        echo -e "   • 공식 웹사이트:   https://multipass.run"
        exit 1
    fi
}

mp_cmd() {
    check_multipass
    "$MP_BIN" "$@"
}

resolve_mount_path() {
    local target_path="$1"
    if [[ "$MP_BIN" == *.exe ]] && command -v wslpath &>/dev/null; then
        wslpath -w "$target_path"
    else
        echo "$target_path"
    fi
}

clean_instance() {
    local inst="$1"
    if mp_cmd list 2>/dev/null | grep -q "^${inst}[[:space:]]"; then
        echo -e "${YELLOW}  • 기존 인스턴스(${inst}) 정지 및 삭제...${NC}"
        mp_cmd stop "${inst}" 2>/dev/null || true
        mp_cmd delete "${inst}" 2>/dev/null || true
        mp_cmd purge 2>/dev/null || true
    fi
}
