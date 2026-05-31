import { App } from '@slack/bolt'
import Anthropic from '@anthropic-ai/sdk'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const BASE_URL = 'http://localhost:3001'
const SESSION = process.env.JARVIS_SESSION_SECRET ?? ''

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
})

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const JARVIS_SYSTEM = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'agents', 'prompts.ts'), 'utf-8')
  .match(/export const JARVIS_SYSTEM = `([\s\S]*?)`/)?.[1] ?? ''

const conversationHistory = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>()

async function jarvisApi(path: string, method = 'GET', body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SESSION}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json() as Promise<Record<string, unknown>>
}

async function askJarvis(userId: string, message: string): Promise<string> {
  const history = conversationHistory.get(userId) ?? []
  history.push({ role: 'user', content: message })

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: JARVIS_SYSTEM,
    messages: history.slice(-10),
  })

  const reply = response.content[0].type === 'text' ? response.content[0].text : ''
  history.push({ role: 'assistant', content: reply })
  conversationHistory.set(userId, history.slice(-20))
  return reply
}

// Main message handler — routes special commands before sending to Jarvis
app.message(async ({ message, say }) => {
  const msg = message as { text?: string; user?: string; channel_type?: string }
  if (!msg.text || !msg.user) return

  const text = msg.text.trim()
  const ts = (message as { ts?: string }).ts

  try {
    // ── Trade approval: TRADE YES [id] ──────────────────────────────────────
    const tradeYes = text.match(/^TRADE YES (.+)$/i)
    if (tradeYes) {
      await say({ text: '⏳ Executing trade...', thread_ts: ts })
      const result = await jarvisApi('/api/trade', 'POST', { proposalId: tradeYes[1].trim() })
      await say({ text: (result.result as string) ?? '❌ Execution failed', thread_ts: ts })
      return
    }

    // ── Trade reject: TRADE NO [id] ─────────────────────────────────────────
    const tradeNo = text.match(/^TRADE NO (.+)$/i)
    if (tradeNo) {
      await say({ text: `✅ Proposal rejected. Jarvis won't execute ${tradeNo[1].trim()}.`, thread_ts: ts })
      return
    }

    // ── Email approval: SEND [email] ────────────────────────────────────────
    const sendEmail = text.match(/^SEND (.+@.+)$/i)
    if (sendEmail) {
      const result = await jarvisApi('/api/conversion', 'POST', { email: sendEmail[1].trim() })
      await say({ text: result.ok ? `✅ Email sent to ${sendEmail[1]}` : '❌ Email failed — check #echo', thread_ts: ts })
      return
    }

    // ── Skip email: SKIP [email] ────────────────────────────────────────────
    const skipEmail = text.match(/^SKIP (.+@.+)$/i)
    if (skipEmail) {
      await say({ text: `⏭️ Skipped ${skipEmail[1]}`, thread_ts: ts })
      return
    }

    // ── Win-back: WINBACK [email] ───────────────────────────────────────────
    const winback = text.match(/^WINBACK (.+@.+)$/i)
    if (winback) {
      const result = await jarvisApi('/api/email', 'POST', { type: 'winback', to: winback[1].trim() })
      await say({ text: result.ok ? `✅ Win-back email sent to ${winback[1]}` : '❌ Failed', thread_ts: ts })
      return
    }

    // ── Portfolio brief ─────────────────────────────────────────────────────
    if (/^(portfolio|positions|trades?|p&l|how.*(portfolio|trading))/i.test(text)) {
      const data = await jarvisApi('/api/portfolio')
      const portfolio = data as { equity: number; dayPL: number; dayPLPct: number; positions: unknown[]; cash: number }
      const sign = portfolio.dayPL >= 0 ? '+' : ''
      await say({
        text: `📊 *TradePilot Portfolio*\nEquity: $${portfolio.equity?.toLocaleString()}\nDay P&L: ${sign}$${portfolio.dayPL?.toFixed(2)} (${sign}${portfolio.dayPLPct?.toFixed(2)}%)\nCash: $${portfolio.cash?.toLocaleString()}\nPositions: ${portfolio.positions?.length}`,
        thread_ts: ts,
      })
      return
    }

    // ── Default: send to Jarvis ─────────────────────────────────────────────
    const reply = await askJarvis(msg.user, text)
    await say({ text: reply, thread_ts: ts })

  } catch (err) {
    console.error('[Slack Bot Error]', err)
    await say({ text: 'Something went wrong. Jarvis is investigating.', thread_ts: ts })
  }
})

app.command('/brief', async ({ command, ack, respond }) => {
  await ack()
  const reply = await askJarvis(command.user_id, 'Give me my morning brief.')
  await respond(reply)
})

app.command('/jarvis', async ({ command, ack, respond }) => {
  await ack()
  const reply = await askJarvis(command.user_id, command.text)
  await respond(reply)
})

app.command('/portfolio', async ({ ack, respond }) => {
  await ack()
  const data = await jarvisApi('/api/portfolio')
  const p = data as { equity: number; dayPL: number; positions: unknown[] }
  await respond(`Portfolio: $${p.equity?.toLocaleString()} | Day P&L: $${p.dayPL?.toFixed(2)} | ${p.positions?.length} positions`)
})

;(async () => {
  await app.start()
  console.log('[Jarvis] Slack bot running — trade approval, email approval, portfolio commands active.')
})()
