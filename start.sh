#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")"

if [[ -f .server.pid ]]; then
  PID=$(cat .server.pid)
  if kill -0 "$PID" 2>/dev/null; then
    echo "Server already running (PID $PID)"
    exit 0
  fi
  rm -f .server.pid
fi

nohup python3 app.py </dev/null > .server.log 2>&1 &
PID=$!
echo "$PID" > .server.pid
sleep 1

if kill -0 "$PID" 2>/dev/null; then
  echo "Server started: PID $PID"
  echo "URL: http://127.0.0.1:5050"
else
  echo "Server failed to start. See .server.log"
  exit 1
fi
