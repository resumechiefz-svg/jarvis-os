#!/bin/bash
# Jarvis OS — Card Chiefz blog generation (runs every other day at 7 AM)
# REEL generates a new SEO blog post and publishes to cardchiefz.com

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export HOME="/Users/anthonyb23xx"

set -a
source /Users/anthonyb23xx/cardchiefz/.env.local 2>/dev/null || true
set +a

echo "[$(date)] Generating Card Chiefz blog post..."

# Call the CC blog API (running via Vercel or locally)
RESULT=$(curl -s https://cardchiefz.com/api/blog 2>/dev/null || \
         curl -s http://localhost:3002/api/blog 2>/dev/null)

TITLE=$(echo "$RESULT" | grep -o '"title":"[^"]*"' | head -1 | sed 's/"title":"//;s/"//')
echo "[$(date)] Published: $TITLE"

# Notify Jarvis via Slack
curl -s -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"channel\":\"#reel\",\"text\":\"📝 *REEL — Card Chiefz Blog Published*\nTitle: $TITLE\nLive at: cardchiefz.com/blog\"}" \
  > /dev/null 2>&1

echo "[$(date)] Done."
