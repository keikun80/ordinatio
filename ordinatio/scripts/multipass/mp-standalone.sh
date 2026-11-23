#!/usr/bin/env bash
# ==============================================================================
# Ordinatio Standalone Automated E2E Runner via Multipass
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "${SCRIPT_DIR}/mp-clean-install-test.sh" --name "ordinatio-standalone" "$@"
