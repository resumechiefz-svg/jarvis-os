/**
 * jarvis-stream.ts — Streaming version of the Jarvis chat function
 *
 * Returns an async generator that yields SSE-style events:
 *   { type: 'agent', agent: AgentName }   — which agent is responding
 *   { type: 'delta', text: string }        — token by token text
 *   { type: 'done', fullText: string }     — stream complete, full text for TTS
 *   { type: 'error', message: string }     — something failed
 *
 * All routing, data-fetching, and enrichment logic is the same as jarvis.ts.
 * Only the final Claude call uses messages.stream() instead of messages.create().
 * Pre-built responses (calendar, email, habits, etc.) yield their text as a
 * single delta so the client always gets the same event shape.
 */

import Anthropic from '@anthropic-ai/sdk'
import {
  JARVIS_SYSTEM, NOVA_SYSTEM, SAGE_SYSTEM, VAULT_SYSTEM, ECHO_SYSTEM,
  REEL_SYSTEM, SCOUT_SYSTEM, LISTER_SYSTEM, DEX_SYSTEM, BEACON_SYSTEM,
  LEDGER_SYSTEM, ATLAS_SYSTEM,
} from './prompts'
import { loadRichMemory } from './memory-engine'
import { supabaseAdmin } from '../supabase/client'
import { searchMemories, saveMemory } from '../memory/vectors'
import { loadProfile, rememberThis, isRememberIntent } from '../memory/profile'
import { detectDirectAgentAddress, getAgentPersonalityPrompt } from './agent-personalities'
import type { AgentName } from '../types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Re-use same cache from jarvis.ts — imported here to share the same module instance
import { invalidateContextCache } from './jarvis'

const AGENT_SYSTEMS: Record<string, string> = {
  nova: NOVA_SYSTEM, sage: SAGE_SYSTEM, vault: VAULT_SYSTEM,
  echo: ECHO_SYSTEM, reel: REEL_SYSTEM, scout: SCOUT_SYSTEM, lister: LISTER_SYSTEM,
  dex: DEX_SYSTEM, beacon: BEACON_SYSTEM, ledger: LEDGER_SYSTEM, atlas: ATLAS_SYSTEM,
}

// Pending email drafts — shared across invocations
const pendingDrafts = new Map<string, { subject: string; body: string; draftId: string; to: string }>()

export type StreamEvent =
  | { type: 'agent'; agent: AgentName }
  | { type: 'delta'; text: string }
  | { type: 'done'; fullText: string }
  | { type: 'error'; message: string }

// ── Helper: yield a pre-built response as a stream ──────────────────────────
async function* staticResponse(agent: AgentName, message: string): AsyncGenerator<StreamEvent> {
  yield { type: 'agent', agent }
  // Simulate token streaming for feel — 8ms per word
  const words = message.split(' ')
  let full = ''
  for (let i = 0; i < words.length; i++) {
    const chunk = (i === 0 ? '' : ' ') + words[i]
    full += chunk
    yield { type: 'delta', text: chunk }
    // Slight delay for natural feel — but not on server, no setTimeout in generators
    // The client will handle rendering cadence
  }
  yield { type: 'done', fullText: message }
}

// ── Context helpers (duplicated from jarvis.ts to avoid circular imports) ──
let ctxCache: { context: string; loadedAt: number } | null = null
const CTX_TTL = 5 * 60 * 1000

async function getCtx(): Promise<string> {
  const now = Date.now()
  if (ctxCache && now - ctxCache.loadedAt < CTX_TTL) return ctxCache.context

  const [memories, richMemory, convHistory] = await Promise.all([
    supabaseAdmin.from('ai_memories').select('category, content, importance')
      .order('importance', { ascending: false }).limit(15).then(r => r.data ?? []),
    loadRichMemory().catch(() => ''),
    supabaseAdmin.from('ai_memories').select('content, context, created_at')
      .eq('category', 'conversation_summary')
      .gte('created_at', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false }).limit(8).then(r => r.data ?? []),
  ])

  const memCtx = memories.length > 0
    ? `\nMemory:\n${memories.map((m: { category: string; content: string }) => `[${m.category}] ${m.content}`).join('\n')}`
    : ''
  const convCtx = convHistory.length > 0
    ? `\n\nRecent conversations:\n${(convHistory as Array<{ content: string; context: string; created_at: string }>).map(d =>
        `[${new Date(d.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}] AB: ${d.content}\nJarvis: ${d.context ?? ''}`
      ).join('\n\n')}`
    : ''

  const context = memCtx + richMemory + convCtx
  ctxCache = { context, loadedAt: now }
  return context
}

function detectRoute(message: string): AgentName {
  const l = message.toLowerCase()
  if (l.includes('stripe') || l.includes('mrr') || l.includes('subscriber') || l.includes('nova') || l.includes('resumechiefz revenue') || l.includes('conversion')) return 'nova'
  if (l.includes('beckett') || l.includes('custody') || l.includes('grocery') || l.includes('bill') || l.includes('sage') || l.includes('morning brief') || l.includes('my week')) return 'sage'
  if (l.includes('ebay') || l.includes('card') || l.includes('vault') || l.includes('listing') || l.includes('card chiefz')) return 'vault'
  if (l.includes('post') || l.includes('content') || l.includes('linkedin') || l.includes('echo') || l.includes('blog') || l.includes('social')) return 'echo'
  if (l.includes('reel') || l.includes('card chiefz content') || l.includes('cc post')) return 'reel'
  if (l.includes('reddit') || l.includes('scout') || l.includes('growth') || l.includes('traffic') || l.includes('seo')) return 'scout'
  if (l.includes('list') || l.includes('format listing') || l.includes('lister')) return 'lister'
  if (l.includes('bug') || l.includes('error') || l.includes('dex') || l.includes('system') || l.includes('site down')) return 'dex'
  if (l.includes('goal') || l.includes('beacon') || l.includes('accountability') || l.includes('progress')) return 'beacon'
  if (l.includes('finances') || l.includes('ledger') || l.includes('money') || l.includes('savings') || l.includes('bills overview')) return 'ledger'
  if (l.includes('strategy') || l.includes('atlas') || l.includes('market intel') || l.includes('business idea') || l.includes('acquisition')) return 'atlas'
  return 'jarvis'
}

function needsSonnet(message: string, route: AgentName): boolean {
  const l = message.toLowerCase()
  return l.includes('analyze') || l.includes('strategy') || l.includes('brief') ||
    l.includes('what should') || l.includes('recommend') || l.includes('plan') ||
    l.includes('explain') || l.includes('market') || l.includes('portfolio') ||
    route !== 'jarvis' || message.length > 100
}

function isPortfolioQuery(msg: string): boolean {
  const l = msg.toLowerCase()
  return l.includes('portfolio') || l.includes('position') || l.includes('alpaca') ||
    l.includes('trading') || l.includes('trade') || l.includes('p&l') || l.includes('equity') ||
    l.includes('stock') || l.includes('how much') || l.includes('how are') || l.includes('performance')
}

// ── Main streaming chat function ─────────────────────────────────────────────
export async function* chatStream(
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): AsyncGenerator<StreamEvent> {

  const sessionKey = history.slice(-1)[0]?.content?.slice(0, 20) ?? 'default'

  // ── Email send confirmation ──────────────────────────────────────────────
  if (/^(yes,?\s*)?(send|send it|go ahead|confirmed?|do it)\.?$/i.test(userMessage.trim())) {
    const pending = pendingDrafts.get(sessionKey) ?? [...pendingDrafts.values()][0]
    if (pending) {
      try {
        const { sendDraft } = await import('./gmail-draft')
        await sendDraft(pending.draftId)
        pendingDrafts.clear()
        yield* staticResponse('sage', `Sent. Email to ${pending.to} is gone — subject "${pending.subject}".`)
        return
      } catch {
        yield* staticResponse('sage', 'Failed to send — check Gmail connection.')
        return
      }
    }
  }

  // ── Direct agent address ─────────────────────────────────────────────────
  const directAgent = detectDirectAgentAddress(userMessage)
  if (directAgent) {
    const stripped = userMessage.replace(new RegExp(`^${directAgent}[,\\s]+`, 'i'), '').trim() || 'what are you working on?'
    const agentSystemMap: Record<string, string> = {
      jarvis: JARVIS_SYSTEM, nova: NOVA_SYSTEM, sage: SAGE_SYSTEM, vault: VAULT_SYSTEM,
      echo: ECHO_SYSTEM, reel: REEL_SYSTEM, scout: SCOUT_SYSTEM, lister: LISTER_SYSTEM,
      dex: DEX_SYSTEM, beacon: BEACON_SYSTEM, ledger: LEDGER_SYSTEM, atlas: ATLAS_SYSTEM,
    }
    yield { type: 'agent', agent: directAgent as AgentName }
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6', max_tokens: 600,
      system: (agentSystemMap[directAgent] ?? JARVIS_SYSTEM) + getAgentPersonalityPrompt(directAgent) +
        `\n\nYou are being addressed directly. Respond in your own voice. Stay in character.`,
      messages: [...history.slice(-6).map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })), { role: 'user', content: stripped }],
    })
    let full = ''
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        full += event.delta.text
        yield { type: 'delta', text: event.delta.text }
      }
    }
    yield { type: 'done', fullText: full }
    return
  }

  // ── Remember this ────────────────────────────────────────────────────────
  if (isRememberIntent(userMessage)) {
    const content = userMessage.replace(/^(remember\s*(that|this|:)?|make a note|don't forget|keep in mind)\s*/i, '').trim()
    await rememberThis(content)
    yield* staticResponse('jarvis', `Locked in, sir. I'll carry "${content}" in every future conversation.`)
    return
  }

  // ── Calendar event ───────────────────────────────────────────────────────
  if (/schedule|add to (my )?calendar|create (an? )?event|book.*meeting|set (up )?a (call|meeting)/i.test(userMessage)) {
    yield { type: 'agent', agent: 'sage' }
    try {
      const { createEvent } = await import('../google/calendar')
      const { isConnected } = await import('../google/auth')
      if (!await isConnected()) {
        yield* staticResponse('sage', 'Google Calendar not connected yet, sir. Visit /api/google/auth to link it.')
        return
      }
      const extraction = await anthropic.messages.create({
        model: 'claude-haiku-4-5', max_tokens: 150,
        messages: [{ role: 'user', content: `Extract event from: "${userMessage}"\nReturn JSON: {"title":"...","start":"ISO datetime","end":"ISO datetime","description":"..."}\nToday is ${new Date().toISOString()}. Default 1 hour.` }],
      })
      const text = extraction.content[0].type === 'text' ? extraction.content[0].text : '{}'
      const match = text.match(/\{[\s\S]*\}/)
      const event = match ? JSON.parse(match[0]) : null
      if (!event?.title || !event?.start) {
        yield* staticResponse('sage', "I need a title and time. Try: 'Schedule a call with X Thursday at 2pm'")
        return
      }
      const url = await createEvent(event)
      yield* staticResponse('sage', `Done, sir. "${event.title}" added to your calendar.\n${url}`)
    } catch (err) {
      yield* staticResponse('sage', `Calendar failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
    return
  }

  // ── All other pre-built routes: delegate to jarvis.ts chat() and stream result ──
  // (Covers: habits, news, churn, blog, ebook, linkedin, outreach, forge, etc.)
  // We detect if it's one of those patterns — if so, call the blocking chat() and
  // stream the result. This avoids duplicating 400+ lines of routing logic.
  const isSpecialRoute =
    /churn|at.risk|cancel|losing subscribers/i.test(userMessage) ||
    /post to linkedin|linkedin post|share on linkedin/i.test(userMessage) ||
    /market intel|competitor|what.*(kickresume|zety)|comp.*scan/i.test(userMessage) ||
    /rc outreach|resumechiefz.*post|post.*rc/i.test(userMessage) ||
    /draft (an? )?email|write (an? )?email|email to|send (an? )?email/i.test(userMessage) ||
    /list (that|this|the)? (card|it)|put (that|this) on ebay|create (a )?listing/i.test(userMessage) ||
    /revenue opportunity|find (an? )?opportunity|atlas.*opportunity/i.test(userMessage) ||
    /what.*fix|what.*update|what.*change|forge.*scan|self.*(heal|improv)/i.test(userMessage) ||
    /post it|list it|go ahead.*list|post.*draft|list.*draft/i.test(userMessage) ||
    /goal velocity|on track|independence (age|by)|financial independence/i.test(userMessage) ||
    /write.*blog|blog.*post|auto.?blog/i.test(userMessage) ||
    /habit|streak|how.*doing.*habits/i.test(userMessage) ||
    /logged|marked?|done|finished|completed|did my/i.test(userMessage) ||
    /trading patterns|trade journal/i.test(userMessage) ||
    /news|what.*happening|market news|morning news/i.test(userMessage) ||
    /(make|create|produce) (a )?(full )?(youtube )?video|youtube pipeline/i.test(userMessage) ||
    /write (a )?(youtube|video) script/i.test(userMessage) ||
    /write (an? )?ebook/i.test(userMessage)

  if (isSpecialRoute) {
    // Fall back to blocking chat() — stream the single response
    const { chat } = await import('./jarvis')
    const result = await chat(userMessage, history)
    yield* staticResponse(result.agent, result.message)
    return
  }

  // ── Main path: full context + Claude streaming ────────────────────────────
  const route = detectRoute(userMessage)
  const usesSonnet = needsSonnet(userMessage, route)
  const model = usesSonnet ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001'

  // Emit agent early so UI can update immediately
  const telemetryAgent: AgentName = route !== 'jarvis' ? route : 'jarvis'
  yield { type: 'agent', agent: telemetryAgent }

  // Parallel data fetching (same as jarvis.ts)
  let agentIntel = ''
  let beckettCtx = ''
  let liveData = ''
  let profileCtx = ''
  let semanticCtx = ''
  let sentimentCtx = ''
  let intentionCtx = ''
  let whoopCtx = ''

  const [context] = await Promise.all([
    getCtx(),
    (async () => {
      if (route === 'sage' || /beckett|son|custody|pickup|drop.?off|father|dad/i.test(userMessage)) {
        try { const { getBeckettContext } = await import('./beckett'); beckettCtx = '\n\n' + await getBeckettContext() } catch { /* skip */ }
      }
    })(),
    (async () => {
      if (isPortfolioQuery(userMessage)) {
        try { const { getPortfolioBrief } = await import('./tradepilot'); liveData = '\n\n[LIVE PORTFOLIO DATA]\n' + await getPortfolioBrief() } catch { /* skip */ }
      }
    })(),
    (async () => {
      try { const profile = await loadProfile(); if (profile) profileCtx = `\n\n[AB PROFILE]\nFocus: ${profile.currentFocus.join(', ')}\nGoals: ${profile.activeGoals.join(', ')}\nStyle: ${profile.communicationStyle}` } catch { /* skip */ }
    })(),
    (async () => {
      try { const mems = await searchMemories(userMessage, { limit: 5, minSimilarity: 0.4 }); if (mems.length > 0) semanticCtx = '\n\n[RELEVANT MEMORIES]\n' + mems.map(m => `[${m.category}] ${m.content}`).join('\n') } catch { /* skip */ }
    })(),
    import('./sentiment-tracker').then(({ getCurrentSentimentContext }) => getCurrentSentimentContext().then(r => { sentimentCtx = r }).catch(() => {})).catch(() => {}),
    import('./weekly-intention').then(({ getIntentionContext }) => getIntentionContext().then(r => { intentionCtx = r }).catch(() => {})).catch(() => {}),
    import('./whoop').then(({ getWhoopContext }) => getWhoopContext().then(r => { whoopCtx = r }).catch(() => {})).catch(() => {}),
  ])

  // Sub-agent intel for non-Jarvis routes
  if (route !== 'jarvis' && AGENT_SYSTEMS[route] && usesSonnet) {
    const intel = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 600,
      system: AGENT_SYSTEMS[route] + getAgentPersonalityPrompt(route) + context,
      messages: [{ role: 'user', content: userMessage }],
    }).then(r => r.content[0].type === 'text' ? r.content[0].text : '').catch(() => '')
    if (intel) agentIntel = `\n\n[${route.toUpperCase()} INTEL]\n${intel}`
  }

  const isDirectRoute = route !== 'jarvis' && !!agentIntel
  const enrichment = sentimentCtx + intentionCtx + whoopCtx

  const systemPrompt = isDirectRoute
    ? (AGENT_SYSTEMS[route] ?? JARVIS_SYSTEM) + getAgentPersonalityPrompt(route) + context + profileCtx + beckettCtx + semanticCtx + liveData + enrichment
    : JARVIS_SYSTEM + context + profileCtx + beckettCtx + semanticCtx + liveData + enrichment + agentIntel +
      (agentIntel ? `\n\nDeliver as JARVIS — synthesized, crisp. Call AB "sir" or "AB".` : '')

  // ── Stream the Claude response ────────────────────────────────────────────
  let fullText = ''
  const stream = anthropic.messages.stream({
    model,
    max_tokens: usesSonnet ? 1200 : 400,
    system: systemPrompt,
    messages: [...history.slice(-4), { role: 'user', content: userMessage }],
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      fullText += event.delta.text
      yield { type: 'delta', text: event.delta.text }
    }
  }

  // ── Clean markdown from final text (same as route.ts) ─────────────────
  const cleanText = fullText
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^---+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  yield { type: 'done', fullText: cleanText }

  // ── Post-response async enrichment (fire and forget) ───────────────────
  if (userMessage.length > 20) {
    Promise.all([
      saveMemory({ category: 'conversation_summary', content: userMessage.slice(0, 200), context: cleanText.slice(0, 300), importance: 6 })
        .catch(() => supabaseAdmin.from('ai_memories').insert({ category: 'conversation_summary', content: userMessage.slice(0, 200), context: cleanText.slice(0, 300), importance: 6, created_at: new Date().toISOString() })),
      import('./decision-journal').then(({ detectAndLogDecision }) => detectAndLogDecision(userMessage, cleanText).catch(() => {})).catch(() => {}),
      import('./relationship-tracker').then(({ detectContactMention }) => detectContactMention(userMessage, cleanText).catch(() => {})).catch(() => {}),
      import('./convo-to-docs').then(({ appendConversationToDoc }) => appendConversationToDoc(userMessage, cleanText, telemetryAgent).catch(() => {})).catch(() => {}),
    ]).catch(() => {})
  }
}
