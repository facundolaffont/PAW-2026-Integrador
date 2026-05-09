#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "[run.sh] Instalando dependencias..."
npm install

echo "[run.sh] Levantando docker compose..."
docker compose --env-file .env up --build
