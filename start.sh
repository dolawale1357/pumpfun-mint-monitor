#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [[ -f package.json ]]; then
  npm install
fi

exec node index.js
