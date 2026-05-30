#!/bin/bash
# Jarvis OS — Morning brief cron (runs at 6 AM daily)
# Triggers Jarvis to generate morning brief and push to Slack

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export HOME="/Users/anthonyb23xx"

set -a
source /Users/anthonyb23xx/jarvis-os/.env.local 2>/dev/null || true
set +a

echo "[$(date)] Running morning brief..."

# Call Jarvis morning brief API
curl -s -X POST http://localhost:3001/api/jarvis \
  -H "Content-Type: application/json" \
  -d '{"mode": "morning_brief"}' \
  >> /tmp/jarvis_morning.log 2>&1

echo "[$(date)] Morning brief complete."
