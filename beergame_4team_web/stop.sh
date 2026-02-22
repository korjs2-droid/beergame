#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -f .server.pid ]]; then
  echo "No PID file (.server.pid)."
  exit 0
fi

PID=$(cat .server.pid)
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  sleep 1
  if kill -0 "$PID" 2>/dev/null; then
    kill -9 "$PID" || true
  fi
  echo "Server stopped (PID $PID)"
else
  echo "Process $PID not running"
fi

rm -f .server.pid
