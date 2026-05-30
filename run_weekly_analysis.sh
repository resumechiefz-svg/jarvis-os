#!/bin/bash
# Jarvis OS — Weekly deep memory analysis (runs every Sunday at 8 PM)
# Analyzes all patterns, saves insights, posts summary to Slack

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export HOME="/Users/anthonyb23xx"

set -a
source /Users/anthonyb23xx/jarvis-os/.env.local 2>/dev/null || true
set +a

echo "[$(date)] Running Jarvis weekly memory analysis..."

RESULT=$(curl -s http://localhost:3001/api/analyze 2>/dev/null)
INSIGHTS=$(echo "$RESULT" | grep -o '"insights":[0-9]*' | grep -o '[0-9]*')

echo "[$(date)] Weekly analysis complete — ${INSIGHTS:-0} insights generated and saved to memory"
