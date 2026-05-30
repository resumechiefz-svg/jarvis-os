#!/bin/bash
# Jarvis OS — Echo daily content cron (runs at 7 AM daily)
# Generates RC social content and pushes to Slack for approval

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export HOME="/Users/anthonyb23xx"

set -a
source /Users/anthonyb23xx/jarvis-os/.env.local 2>/dev/null || true
set +a

echo "[$(date)] Running Echo daily content generation..."

curl -s http://localhost:3001/api/echo \
  >> /tmp/jarvis_echo.log 2>&1

echo "[$(date)] Echo content pushed to Slack for approval."
