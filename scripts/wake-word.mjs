#!/usr/bin/env node
/**
 * Jarvis Wake Word — "Hey Jarvis" triggers from anywhere on Mac
 * Uses Picovoice Porcupine (on-device, private, no cloud)
 *
 * Setup:
 * 1. Get free access key at picovoice.ai/console
 * 2. Set PICOVOICE_ACCESS_KEY in .env.local
 * 3. Run: node scripts/wake-word.mjs
 * 4. launchd service handles auto-start on login
 *
 * On wake word detected → opens Jarvis HUD in Chrome + activates voice
 */

import { execSync, exec } from 'child_process'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// Load env
try {
  const env = readFileSync(resolve(ROOT, '.env.local'), 'utf-8')
  env.split('\n').forEach(line => {
    const [k, ...v] = line.split('=')
    if (k && !k.startsWith('#')) process.env[k.trim()] = v.join('=').trim()
  })
} catch { /* env already loaded */ }

const ACCESS_KEY = process.env.PICOVOICE_ACCESS_KEY
const JARVIS_URL = 'http://localhost:3001'

if (!ACCESS_KEY) {
  console.error(`
╔══════════════════════════════════════════════════════╗
║  JARVIS WAKE WORD — SETUP REQUIRED                   ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  1. Go to: https://picovoice.ai/console/             ║
║  2. Sign up free (no credit card)                    ║
║  3. Copy your Access Key                             ║
║  4. Add to .env.local:                               ║
║     PICOVOICE_ACCESS_KEY=your_key_here               ║
║                                                      ║
║  Free tier: unlimited wake word detections           ║
╚══════════════════════════════════════════════════════╝
`)
  process.exit(1)
}

async function startWakeWord() {
  try {
    const { Porcupine, BuiltinKeyword } = await import('@picovoice/porcupine-node')
    const { PvRecorder } = await import('@picovoice/pvrecorder-node')

    const porcupine = new Porcupine(
      ACCESS_KEY,
      [BuiltinKeyword.JARVIS],  // Built-in "Jarvis" wake word — no custom model needed
      [0.6]                      // Sensitivity 0-1 (higher = more sensitive, more false positives)
    )

    const recorder = new PvRecorder(porcupine.frameLength, -1) // -1 = default mic
    recorder.start()

    console.log(`[Jarvis Wake Word] Listening for "Hey Jarvis"... (Press Ctrl+C to stop)`)

    let lastTrigger = 0
    const COOLDOWN = 3000 // 3s between triggers

    while (true) {
      const frame = await recorder.read()
      const keywordIndex = porcupine.process(frame)

      if (keywordIndex >= 0) {
        const now = Date.now()
        if (now - lastTrigger < COOLDOWN) continue
        lastTrigger = now

        console.log(`[${new Date().toLocaleTimeString()}] Wake word detected — opening Jarvis`)

        // Open Jarvis in Chrome (or bring it to front if already open)
        exec(`osascript -e '
          tell application "Google Chrome"
            activate
            set found to false
            repeat with w in windows
              repeat with t in tabs of w
                if URL of t contains "localhost:3001" then
                  set active tab index of w to tab index of t
                  set index of w to 1
                  set found to true
                  exit repeat
                end if
              end repeat
              if found then exit repeat
            end repeat
            if not found then
              open location "${JARVIS_URL}"
            end if
          end tell
        '`, () => {})

        // Notify Jarvis to activate voice mode
        fetch(`${JARVIS_URL}/api/voice/wake`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trigger: 'porcupine', timestamp: Date.now() }),
        }).catch(() => {})
      }
    }
  } catch (err) {
    if (err.message?.includes('not found') || err.message?.includes('Cannot find module')) {
      console.error('[Wake Word] Porcupine not installed. Run: npm install @picovoice/porcupine-node @picovoice/pvrecorder-node')
    } else {
      console.error('[Wake Word] Error:', err.message)
    }
    process.exit(1)
  }
}

startWakeWord()
