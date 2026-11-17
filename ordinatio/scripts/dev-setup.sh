#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo "🚀 ordinatio Development Environment Initialization (Phase 0)"
echo "=========================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

# 1. Check Python & UV
if ! command -v uv &> /dev/null; then
    echo "❌ uv is not installed. Please install uv (https://github.com/astral-sh/uv)."
    exit 1
fi
echo "✅ uv found: $(uv --version)"

# 2. Check Node & NPM
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed."
    exit 1
fi
echo "✅ npm found: $(npm -v)"

# 3. Backend Setup
echo "==> [1/2] Syncing Python Backend dependencies..."
cd "${ROOT_DIR}/backend"
uv sync

# 4. Frontend Setup
echo "==> [2/2] Installing Frontend dependencies..."
cd "${ROOT_DIR}/frontend"
npm install --prefer-offline --no-audit

echo "=========================================================="
echo "🎉 Setup Complete! Run 'make verify-phase0' to validate."
echo "=========================================================="
