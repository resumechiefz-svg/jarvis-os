import Anthropic from '@anthropic-ai/sdk'
import { JARVIS_SYSTEM, NOVA_SYSTEM, SAGE_SYSTEM, VAULT_SYSTEM, ECHO_SYSTEM, REEL_SYSTEM, SCOUT_SYSTEM, LISTER_SYSTEM, DEX_SYSTEM, BEACON_SYSTEM, LEDGER_SYSTEM, ATLAS_SYSTEM } from './prompts'
import { loadRichMemory } from './memory-engine'
import { supabaseAdmin } from '../supabase/client'
import type { AgentName, JarvisResponse, Memory } from '../types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── In-memory context cache — refreshes every 5 minutes ──────────────────────
// Eliminates 3 sequential Supabase calls on every message
interface ContextCache {
  context: string
  loadedAt: number
}
let contextCache: ContextCache | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

async function getCachedContext(): Promise<string> {
  const now = Date.now()
  if (contextCache && now - contextCache.loadedAt < CACHE_TTL) {
    return contextCache.context
  }

  // Load all context in parallel
  const [memories, richMemory, convHistory] = await Promise.all([
    supabaseAdmin.from('ai_memories').select('category, content, importance').order('importance', { ascending: false }).limit(15).then(r => r.data ?? []),
    loadRichMemory().catch(() => ''),
    supabaseAdmin.from('ai_memories').select('content, context, created_at').eq('category', 'conversation_summary').gte('created_at', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()).order('created_at', { ascending: false }).limit(8).then(r => r.data ?? []),
  ])

  const memCtx = memories.length > 0
    ? `\nMemory:\n${memories.map((m: { category: string; content: string; importance: number }) => `[${m.category}] ${m.content}`).join('\n')}`
    : ''

  const convCtx = convHistory.length > 0
    ? `\n\nRecent conversations:\n${(convHistory as Array<{ content: string; context: string; created_at: string }>).map(d => `[${new Date(d.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}] AB: ${d.content}\nJarvis: ${d.context ?? ''}`).join('\n\n')}`
    : ''

  const context = memCtx + richMemory + convCtx
  contextCache = { context, loadedAt: now }
  return context
}

// Force-refresh cache (called after saving new memories)
export function invalidateContextCache() {
  contextCache = null
}

function isBuildIntent(message: string): boolean {
  const l = message.toLowerCase()
  return (
    (l.includes('build') || l.includes('create') || l.includes('make') || l.includes('develop') || l.includes('launch') || l.includes('ship') || l.includes('code')) &&
    (l.includes('app') || l.includes('site') || l.includes('tool') || l.includes('saas') || l.includes('dashboard') || l.includes('platform') || l.includes('website') || l.includes('product'))
  )
}

function detectRoute(message: string): AgentName {
  const lower = message.toLowerCase()
  if (lower.includes('stripe') || lower.includes('mrr') || lower.includes('subscriber') || lower.includes('nova') || lower.includes('resumechiefz revenue') || lower.includes('conversion')) return 'nova'
  if (lower.includes('beckett') || lower.includes('custody') || lower.includes('grocery') || lower.includes('bill') || lower.includes('sage') || lower.includes('morning brief') || lower.includes('my week')) return 'sage'
  if (lower.includes('ebay') || lower.includes('card') || lower.includes('vault') || lower.includes('listing') || lower.includes('card chiefz')) return 'vault'
  if (lower.includes('post') || lower.includes('content') || lower.includes('linkedin') || lower.includes('echo') || lower.includes('blog') || lower.includes('social')) return 'echo'
  if (lower.includes('reel') || lower.includes('card chiefz content') || lower.includes('cc post')) return 'reel'
  if (lower.includes('reddit') || lower.includes('scout') || lower.includes('growth') || lower.includes('traffic') || lower.includes('seo')) return 'scout'
  if (lower.includes('list') || lower.includes('format listing') || lower.includes('lister')) return 'lister'
  if (lower.includes('bug') || lower.includes('error') || lower.includes('dex') || lower.includes('system') || lower.includes('site down')) return 'dex'
  if (lower.includes('goal') || lower.includes('beacon') || lower.includes('accountability') || lower.includes('progress')) return 'beacon'
  if (lower.includes('finances') || lower.includes('ledger') || lower.includes('money') || lower.includes('savings') || lower.includes('bills overview')) return 'ledger'
  if (lower.includes('strategy') || lower.includes('atlas') || lower.includes('market intel') || lower.includes('business idea') || lower.includes('acquisition')) return 'atlas'
  return 'jarvis'
}

const AGENT_SYSTEMS: Record<string, string> = {
  nova: NOVA_SYSTEM, sage: SAGE_SYSTEM, vault: VAULT_SYSTEM,
  echo: ECHO_SYSTEM, reel: REEL_SYSTEM, scout: SCOUT_SYSTEM, lister: LISTER_SYSTEM,
  dex: DEX_SYSTEM, beacon: BEACON_SYSTEM, ledger: LEDGER_SYSTEM, atlas: ATLAS_SYSTEM,
}

// Fast route: simple conversational messages use Haiku (< 300ms typical)
// Complex analysis routes use Sonnet
function needsSonnet(message: string, route: AgentName): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('analyze') || lower.includes('strategy') || lower.includes('brief') ||
    lower.includes('what should') || lower.includes('recommend') || lower.includes('plan') ||
    lower.includes('explain') || lower.includes('market') || lower.includes('portfolio') ||
    route !== 'jarvis' || message.length > 100
  )
}

function isPortfolioQuery(msg: string): boolean {
  const l = msg.toLowerCase()
  return l.includes('portfolio') || l.includes('position') || l.includes('alpaca') ||
    l.includes('trading') || l.includes('trade') || l.includes('p&l') || l.includes('equity') ||
    l.includes('stock') || l.includes('how much') || l.includes('how are') || l.includes('performance')
}

export async function chat(userMessage: string, history: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<JarvisResponse> {
  const [context, route] = await Promise.all([
    getCachedContext(),
    Promise.resolve(detectRoute(userMessage)),
  ])

  const usesSonnet = needsSonnet(userMessage, route)
  const model = usesSonnet ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001'

  let agentIntel = ''
  let telemetryAgent: AgentName = 'jarvis'

  // FORGE: detect build intent and hand off to build engine
  if (isBuildIntent(userMessage)) {
    try {
      const { startBuild } = await import('./forge/builder')
      const job = await startBuild(userMessage)
      return {
        agent: 'jarvis' as AgentName,
        message: `FORGE is on it, sir. I've handed "${userMessage}" to the build engine.\n\nAtlas is speccing the architecture now. You'll get updates in #forge on Slack as each phase completes — spec, build, deploy. When it's live, I'll post the URL.\n\nBuild ID: ${job.id}`,
      }
    } catch (err) {
      return {
        agent: 'jarvis' as AgentName,
        message: `FORGE couldn't start: ${err instanceof Error ? err.message : 'Unknown error'}. Try again or check #forge in Slack.`,
      }
    }
  }

  // Inject live portfolio data for trading questions — no hallucination
  let liveData = ''
  if (isPortfolioQuery(userMessage)) {
    try {
      const { getPortfolioBrief } = await import('./tradepilot')
      liveData = '\n\n[LIVE PORTFOLIO DATA]\n' + await getPortfolioBrief()
    } catch { /* skip */ }
  }

  // Only call sub-agents for relevant complex queries
  if (route !== 'jarvis' && AGENT_SYSTEMS[route] && usesSonnet) {
    const intel = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', // Always Haiku for sub-agents
      max_tokens: 600,
      system: AGENT_SYSTEMS[route] + context,
      messages: [{ role: 'user', content: userMessage }],
    }).then(r => r.content[0].type === 'text' ? r.content[0].text : '').catch(() => '')

    agentIntel = intel ? `\n\n[${route.toUpperCase()} INTEL]\n${intel}` : ''
    telemetryAgent = route
  }

  const systemPrompt = JARVIS_SYSTEM + context + liveData + agentIntel +
    (agentIntel ? `\n\nDeliver as JARVIS — synthesized, crisp, in your voice. Call AB "sir" or "AB".` : '')

  const response = await anthropic.messages.create({
    model,
    max_tokens: usesSonnet ? 1200 : 400,
    system: systemPrompt,
    messages: [...history.slice(-4), { role: 'user', content: userMessage }],
  })

  const reply = response.content[0].type === 'text' ? response.content[0].text : ''

  // Save conversation async — don't block response
  if (userMessage.length > 20) {
    void supabaseAdmin.from('ai_memories').insert({
      category: 'conversation_summary',
      content: userMessage.slice(0, 200),
      context: reply.slice(0, 300),
      importance: 6,
      created_at: new Date().toISOString(),
    })
  }

  return { agent: telemetryAgent, message: reply }
}

export async function morningBrief(): Promise<JarvisResponse> {
  const context = await getCachedContext()
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const [sageIntel, novaIntel] = await Promise.all([
    anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: SAGE_SYSTEM + context,
      messages: [{ role: 'user', content: `Morning brief for ${today}. AB's personal situation, Beckett, bills today.` }],
    }).then(r => r.content[0].type === 'text' ? r.content[0].text : '').catch(() => ''),
    anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: NOVA_SYSTEM,
      messages: [{ role: 'user', content: 'Quick RC metrics summary.' }],
    }).then(r => r.content[0].type === 'text' ? r.content[0].text : '').catch(() => ''),
  ])

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    system: JARVIS_SYSTEM + context,
    messages: [{
      role: 'user',
      content: `Give AB his morning brief for ${today}.\n\n[SAGE]\n${sageIntel}\n\n[NOVA]\n${novaIntel}\n\nBe crisp. Open with the most important thing. Call him AB.`,
    }],
  })

  const message = response.content[0].type === 'text' ? response.content[0].text : ''
  return { agent: 'jarvis', message }
}
