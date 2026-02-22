#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")"

if [[ -f .server.pid ]]; then
  PID=$(cat .server.pid)
  if kill -0 "$PID" 2>/dev/null; then
    echo "RUNNING PID=$PID"
    lsof -nP -iTCP:5050 -sTCP:LISTEN || true
    exit 0
  fi
fi

echo "STOPPED"
exit 1
