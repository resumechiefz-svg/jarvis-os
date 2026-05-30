#!/bin/bash
# Jarvis OS — Slack bot startup script

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export HOME="/Users/anthonyb23xx"

cd /Users/anthonyb23xx/jarvis-os

# Load env vars from .env.local
set -a
source /Users/anthonyb23xx/jarvis-os/.env.local 2>/dev/null || true
set +a

echo "[$(date)] Starting Jarvis OS Slack bot..."
exec /opt/homebrew/bin/npm run slack
