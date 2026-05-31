#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export HOME="/Users/anthonyb23xx"
cd /Users/anthonyb23xx/jarvis-os

# Explicitly export every key the bot needs
export SLACK_BOT_TOKEN=$(grep "^SLACK_BOT_TOKEN=" .env.local | cut -d= -f2-)
export SLACK_SIGNING_SECRET=$(grep "^SLACK_SIGNING_SECRET=" .env.local | cut -d= -f2-)
export SLACK_APP_TOKEN=$(grep "^SLACK_APP_TOKEN=" .env.local | cut -d= -f2-)
export ANTHROPIC_API_KEY=$(grep "^ANTHROPIC_API_KEY=" .env.local | cut -d= -f2-)
export JARVIS_SESSION_SECRET=$(grep "^JARVIS_SESSION_SECRET=" .env.local | cut -d= -f2-)

echo "[$(date)] Starting Jarvis Slack bot..."
exec /opt/homebrew/bin/npm run slack
