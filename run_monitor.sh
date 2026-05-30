#!/bin/bash
# Jarvis OS — Proactive Monitor (runs every 15 minutes via launchd)
# Checks all systems and fires Slack alerts when thresholds are crossed

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export HOME="/Users/anthonyb23xx"

set -a
source /Users/anthonyb23xx/jarvis-os/.env.local 2>/dev/null || true
set +a

echo "[$(date)] Running Jarvis proactive monitor..."

# Wait for HUD to be ready (first boot grace period)
if ! curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/monitor 2>/dev/null | grep -q "200"; then
  echo "[$(date)] HUD not ready yet, skipping cycle"
  exit 0
fi

RESULT=$(curl -s http://localhost:3001/api/monitor 2>/dev/null)
ALERTS=$(echo "$RESULT" | grep -o '"alerts":[0-9]*' | grep -o '[0-9]*')
CRITICAL=$(echo "$RESULT" | grep -o '"critical":[0-9]*' | grep -o '[0-9]*')

echo "[$(date)] Monitor complete — Alerts: ${ALERTS:-0}, Critical: ${CRITICAL:-0}"
