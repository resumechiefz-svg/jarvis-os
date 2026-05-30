#!/bin/bash
# Jarvis OS — HUD startup script
# Runs the Next.js server on port 3001

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export HOME="/Users/anthonyb23xx"

cd /Users/anthonyb23xx/jarvis-os

# Load env vars from .env.local
set -a
source /Users/anthonyb23xx/jarvis-os/.env.local 2>/dev/null || true
set +a

echo "[$(date)] Starting Jarvis OS HUD on port 3001..."
exec /opt/homebrew/bin/npm run start -- -p 3001
