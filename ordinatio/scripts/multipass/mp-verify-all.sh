#!/usr/bin/env bash
# ==============================================================================
# Ordinatio All Menus Remote E2E Verification Runner via Multipass
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "${SCRIPT_DIR}/mp-clean-install-test.sh" "$@"
