#!/bin/bash
# Jarvis OS — Reel daily content cron (runs at 7:30 AM daily)
# Generates CC social content and pushes to Slack for approval

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export HOME="/Users/anthonyb23xx"

set -a
source /Users/anthonyb23xx/jarvis-os/.env.local 2>/dev/null || true
set +a

echo "[$(date)] Running Reel daily content generation..."

curl -s http://localhost:3001/api/reel \
  >> /tmp/jarvis_reel.log 2>&1

echo "[$(date)] Reel content pushed to Slack for approval."
