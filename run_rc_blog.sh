#!/bin/bash
# Jarvis OS — RC Blog generation (Mon/Wed/Fri/Sun at 7:30 AM)
# Echo generates SEO recruiter content, publishes to resumechiefz.com/blog

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export HOME="/Users/anthonyb23xx"

set -a
source /Users/anthonyb23xx/jarvis-os/.env.local 2>/dev/null || true
set +a

echo "[$(date)] Generating RC blog post..."

RESULT=$(curl -s -H "Authorization: Bearer $JARVIS_SESSION_SECRET" http://localhost:3001/api/rc-blog 2>/dev/null)
TITLE=$(echo "$RESULT" | grep -o '"title":"[^"]*"' | sed 's/"title":"//;s/"//')
echo "[$(date)] Published: $TITLE"
