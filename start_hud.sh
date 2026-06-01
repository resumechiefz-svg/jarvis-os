#!/bin/bash
# Jarvis OS — HUD startup script
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export HOME="/Users/anthonyb23xx"

cd /Users/anthonyb23xx/jarvis-os

# Load env vars
set -a
source /Users/anthonyb23xx/jarvis-os/.env.local 2>/dev/null || true
set +a

# Always build before starting — prevents "no production build" crash loop
if [ ! -d ".next" ] || [ ! -f ".next/BUILD_ID" ]; then
  echo "[$(date)] No build found — building now..."
  /opt/homebrew/bin/npm run build 2>&1
fi

echo "[$(date)] Starting Jarvis OS on port 3001..."
exec /opt/homebrew/bin/npm run start -- -p 3001
