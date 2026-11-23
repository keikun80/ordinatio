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
        echo -e "${RED}❌ [ERROR] Multipass 실행 바이너리를 찾을 수 없습니다.${NC}"
        echo -e "   • Windows 11: winget install Canonical.Multipass"
        echo -e "   • macOS:      brew install --cask multipass"
        echo -e "   • Linux:      sudo snap install multipass"
        exit 1
    fi
}

mp_cmd() {
    check_multipass
    "$MP_BIN" "$@"
}
