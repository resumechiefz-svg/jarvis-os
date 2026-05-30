import { App } from '@slack/bolt'
import Anthropic from '@anthropic-ai/sdk'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

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

// Listen in DMs and #jarvis channel
app.message(async ({ message, say }) => {
  const msg = message as { text?: string; user?: string; channel_type?: string }
  if (!msg.text || !msg.user) return

  try {
    const reply = await askJarvis(msg.user, msg.text)
    await say({ text: reply, thread_ts: (message as { ts?: string }).ts })
  } catch (err) {
    console.error('[Slack Bot Error]', err)
    await say('Something went wrong. Jarvis is investigating.')
  }
})

// Slash command: /brief
app.command('/brief', async ({ command, ack, respond }) => {
  await ack()
  const reply = await askJarvis(command.user_id, 'Give me my morning brief.')
  await respond(reply)
})

// Slash command: /jarvis
app.command('/jarvis', async ({ command, ack, respond }) => {
  await ack()
  const reply = await askJarvis(command.user_id, command.text)
  await respond(reply)
})

;(async () => {
  await app.start()
  console.log('[Jarvis] Slack bot is running.')
})()
