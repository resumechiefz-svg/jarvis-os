import Anthropic from '@anthropic-ai/sdk'
import { JARVIS_SYSTEM, NOVA_SYSTEM, SAGE_SYSTEM, VAULT_SYSTEM, ECHO_SYSTEM, REEL_SYSTEM, SCOUT_SYSTEM, LISTER_SYSTEM, DEX_SYSTEM, BEACON_SYSTEM, LEDGER_SYSTEM, ATLAS_SYSTEM } from './prompts'
import { loadRichMemory } from './memory-engine'
import { supabaseAdmin } from '../supabase/client'
import { searchMemories, saveMemory } from '../memory/vectors'
import { loadProfile, rememberThis, isRememberIntent } from '../memory/profile'
import { detectDirectAgentAddress, getAgentPersonalityPrompt } from './agent-personalities'
import type { AgentName, JarvisResponse, Memory } from '../types'

// ── Pending email drafts — waiting for "send" confirmation ───────────────────
const pendingEmailDrafts = new Map<string, { subject: string; body: string; draftId: string; to: string }>()

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

  // Load all context in parallel — now includes vector semantic search
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

function isImageIntent(message: string): boolean {
  const l = message.toLowerCase()
  return (
    (l.includes('image') || l.includes('photo') || l.includes('graphic') || l.includes('visual') || l.includes('picture') || l.includes('banner') || l.includes('thumbnail') || l.includes('generate an') || l.includes('create a') || l.includes('make a') || l.includes('lumen')) &&
    (l.includes('for') || l.includes('instagram') || l.includes('twitter') || l.includes('post') || l.includes('blog') || l.includes('social') || l.includes('card chiefz') || l.includes('resumechiefz') || l.includes('image'))
  )
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
  if (lower.includes('outreach') || lower.includes('rc outreach') || lower.includes('linkedin post') || lower.includes('reddit post') || lower.includes('resumechiefz content')) return 'echo'
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

function isMarketIntelIntent(msg: string): boolean {
  const l = msg.toLowerCase()
  return l.includes('market intel') || l.includes('competitor') || l.includes('run intel') ||
    l.includes('check competitors') || l.includes('what are competitors') || l.includes('card market') && l.includes('report')
}

function isOutreachIntent(msg: string): boolean {
  const l = msg.toLowerCase()
  return (l.includes('run outreach') || l.includes('generate outreach') || l.includes('rc posts') ||
    l.includes('resumechiefz posts') || l.includes('generate posts') || l.includes('content for resumechiefz')) &&
    !l.includes('card chiefz')
}

export async function chat(userMessage: string, history: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<JarvisResponse> {
  const sessionKey = history.slice(-1)[0]?.content?.slice(0, 20) ?? 'default'

  // ── Email send confirmation — "send it" / "yes send" ─────
  if (/^(yes,?\s*)?(send|send it|go ahead|confirmed?|do it)\.?$/i.test(userMessage.trim())) {
    const pending = pendingEmailDrafts.get(sessionKey) ?? [...pendingEmailDrafts.values()][0]
    if (pending) {
      try {
        const { sendDraft } = await import('./gmail-draft')
        await sendDraft(pending.draftId)
        pendingEmailDrafts.clear()
        return { agent: 'sage' as AgentName, message: `Sent. Email to ${pending.to} is gone — subject "${pending.subject}".` }
      } catch {
        return { agent: 'sage' as AgentName, message: 'Failed to send — check Gmail connection.' }
      }
    }
  }

  // ── Direct agent address — "Echo, what are you working on?" ─
  const directAgent = detectDirectAgentAddress(userMessage)
  if (directAgent) {
    const strippedMessage = userMessage.replace(new RegExp(`^${directAgent}[,\\s]+`, 'i'), '').trim() || 'what are you working on?'
    const agentSystemMap: Record<string, string> = {
      jarvis: JARVIS_SYSTEM, nova: NOVA_SYSTEM, sage: SAGE_SYSTEM,
      vault: VAULT_SYSTEM, echo: ECHO_SYSTEM, reel: REEL_SYSTEM,
      scout: SCOUT_SYSTEM, lister: LISTER_SYSTEM, dex: DEX_SYSTEM,
      beacon: BEACON_SYSTEM, ledger: LEDGER_SYSTEM, atlas: ATLAS_SYSTEM,
    }
    const baseSystem = agentSystemMap[directAgent] ?? JARVIS_SYSTEM
    const personalityPrompt = getAgentPersonalityPrompt(directAgent)

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: baseSystem + personalityPrompt + `\n\nYou are being addressed directly. Respond in your own voice and personality. Stay in character completely.`,
      messages: [
        ...history.slice(-6).map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
        { role: 'user', content: strippedMessage },
      ],
    })

    const message = response.content[0].type === 'text' ? response.content[0].text : ''
    return { agent: directAgent as AgentName, message }
  }

  // ── "Remember this" — explicit memory pinning ────────────
  if (isRememberIntent(userMessage)) {
    const content = userMessage.replace(/^(remember\s*(that|this|:)?|make a note|don't forget|keep in mind)\s*/i, '').trim()
    await rememberThis(content)
    return { agent: 'jarvis' as AgentName, message: `Locked in, sir. I'll carry "${content}" in every future conversation.` }
  }

  // ── Create calendar event ────────────────────────────────
  if (/schedule|add to (my )?calendar|create (an? )?event|book.*meeting|set (up )?a (call|meeting)/i.test(userMessage)) {
    try {
      const { createEvent } = await import('../google/calendar')
      const { isConnected } = await import('../google/auth')
      if (!await isConnected()) return { agent: 'sage' as AgentName, message: 'Google Calendar not connected yet, sir. Visit /api/google/auth to link it.' }
      // Extract details with Claude
      const extraction = await anthropic.messages.create({
        model: 'claude-haiku-4-5', max_tokens: 150,
        messages: [{ role: 'user', content: `Extract event details from: "${userMessage}"\nReturn JSON: {"title":"...","start":"ISO datetime","end":"ISO datetime","description":"..."}\nAssume today is ${new Date().toISOString()}. Default duration 1 hour.` }],
      })
      const text = extraction.content[0].type === 'text' ? extraction.content[0].text : '{}'
      const match = text.match(/\{[\s\S]*\}/)
      const event = match ? JSON.parse(match[0]) : null
      if (!event?.title || !event?.start) return { agent: 'sage' as AgentName, message: "I need a title and time to create the event. Try: 'Schedule a call with X Thursday at 2pm'" }
      const url = await createEvent(event)
      return { agent: 'sage' as AgentName, message: `Done, sir. "${event.title}" added to your calendar.\n${url}` }
    } catch (err) {
      return { agent: 'sage' as AgentName, message: `Calendar event failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
    }
  }

  // ── Goal velocity ─────────────────────────────────────────
  if (/goal velocity|on track|independence (age|by)|financial independence.*when|when.*financial independence|project.*million|million.*age/i.test(userMessage)) {
    try {
      const { calculateGoalVelocity } = await import('./goal-velocity')
      const r = await calculateGoalVelocity()
      return { agent: 'beacon' as AgentName, message: `${r.message}\n\nPortfolio: $${r.currentEquity.toLocaleString()} | RC MRR: $${r.currentMRR.toFixed(0)}\nProjected $1M: Age ${r.projectedMillionAge}. Full report posted to #jarvis.` }
    } catch (err) {
      return { agent: 'beacon' as AgentName, message: `Velocity calc failed: ${err instanceof Error ? err.message : 'Unknown'}` }
    }
  }

  // ── Blog post generation ──────────────────────────────────
  if (/write.*blog|blog.*post|auto.?blog|generate.*post for (rc|resumechiefz|card chiefz)/i.test(userMessage)) {
    try {
      const { runAutoBlog } = await import('./autoblog')
      const brand = /card chiefz/i.test(userMessage) ? 'cc' : 'rc'
      const result = await runAutoBlog(brand)
      return { agent: 'echo' as AgentName, message: `Blog draft ready, sir.\n\nTitle: "${result.title}"\nSlug: /${result.slug}\n\nPosted to Slack for your approval. One tap to publish.` }
    } catch (err) {
      return { agent: 'echo' as AgentName, message: `Blog generation failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
    }
  }

  // ── Churn check ───────────────────────────────────────────
  if (/churn|at.risk|cancel|losing subscribers/i.test(userMessage)) {
    try {
      const { runChurnPrediction } = await import('./churn-predict')
      const risks = await runChurnPrediction()
      return { agent: 'nova' as AgentName, message: risks.length > 0 ? `${risks.length} subscribers at churn risk, sir. Report posted to Slack with action items for each.` : 'No high-risk subscribers detected. RC retention looks healthy.' }
    } catch (err) {
      return { agent: 'nova' as AgentName, message: `Churn check failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
    }
  }

  // ── LinkedIn post ─────────────────────────────────────────
  if (/post to linkedin|linkedin post|share on linkedin/i.test(userMessage)) {
    try {
      const { postToLinkedIn, isLinkedInConnected } = await import('./linkedin')
      const connected = await isLinkedInConnected()
      if (!connected) return { agent: 'echo' as AgentName, message: `LinkedIn not connected yet, sir. Visit /api/linkedin/auth to authorize, then I can post directly.` }
      const content = userMessage.replace(/post (this |to |on )?linkedin:?/i, '').trim()
      if (!content || content.length < 20) return { agent: 'echo' as AgentName, message: 'What would you like me to post? Give me the content.' }
      const id = await postToLinkedIn(content)
      return { agent: 'echo' as AgentName, message: `Posted to LinkedIn, sir. Post ID: ${id}` }
    } catch (err) {
      return { agent: 'echo' as AgentName, message: `LinkedIn post failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
    }
  }

  // ── Market Intel shortcut ─────────────────────────────────
  if (isMarketIntelIntent(userMessage)) {
    try {
      const { runMarketIntel } = await import('./market-intel')
      const result = await runMarketIntel()
      return { agent: 'scout' as AgentName, message: `Market intel sweep complete, sir.\n\n${result.summary.slice(0, 800)}...\n\nFull report posted to Slack #market-intel.` }
    } catch (err) {
      return { agent: 'scout' as AgentName, message: `Market intel failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
    }
  }

  // ── RC Outreach shortcut ──────────────────────────────────
  if (isOutreachIntent(userMessage)) {
    try {
      const { runRCOutreach } = await import('./rc-outreach')
      const posts = await runRCOutreach()
      return { agent: 'echo' as AgentName, message: `RC Outreach batch ready, sir. Generated ${posts.length} posts:\n${posts.map(p => `• ${p.platform}${p.community ? ` (${p.community})` : ''}`).join('\n')}\n\nAll sent to Slack for your approval.` }
    } catch (err) {
      return { agent: 'echo' as AgentName, message: `RC Outreach failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
    }
  }

  // ── Email draft — reads back before sending ───────────────
  if (/draft (an? )?email|write (an? )?email|email to|send (an? )?email to/i.test(userMessage)) {
    try {
      const { draftEmail } = await import('./gmail-draft')
      const toMatch = userMessage.match(/to\s+([^\s,]+@[^\s,]+|[\w\s]+?)(?:\s+about|\s+re:|\s+regarding|$)/i)
      const to = toMatch?.[1]?.trim() ?? 'unknown'
      const draft = await draftEmail({ to, context: userMessage, tone: 'professional' })

      // Store pending — waiting for "send" confirmation
      pendingEmailDrafts.clear()
      pendingEmailDrafts.set(sessionKey, { ...draft, to })

      // Read it back so AB can hear it before confirming
      const readback = `Here's what I've got, sir. To: ${to}. Subject: ${draft.subject}. ${draft.body.slice(0, 300)}. Want me to send it?`
      return { agent: 'sage' as AgentName, message: readback }
    } catch (err) {
      return { agent: 'sage' as AgentName, message: `Email draft failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
    }
  }

  // ── Voice-to-action: eBay listing from description ─────────
  if (/list (that |this |the )?(card|it)|put (that|this|it) on ebay|create (a )?listing/i.test(userMessage)) {
    try {
      const { getListingRecommendations } = await import('./lister')
      const listing = await getListingRecommendations(userMessage)
      const price = userMessage.match(/\$(\d+)/)?.[1] ?? '?'
      return { agent: 'lister' as AgentName, message: `${listing} Posted to #lister for review.` }
    } catch (err) {
      return { agent: 'lister' as AgentName, message: `Listing failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
    }
  }

  // ── Voice-to-action: revenue opportunity scan ───────────────
  if (/revenue opportunity|find (an? )?opportunity|what opportunity|spot (an? )?opportunity|atlas.*opportunity/i.test(userMessage)) {
    try {
      const { scanForOpportunities } = await import('./revenue-scout')
      await scanForOpportunities()
      return { agent: 'atlas' as AgentName, message: `Running an opportunity scan now, sir. I'll post what I find to #jarvis within a minute — full execution plan included.` }
    } catch (err) {
      return { agent: 'atlas' as AgentName, message: `Scan failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
    }
  }

  // ── Voice-to-action: YouTube/ebook content ─────────────────
  if (/write (a )?(youtube|video) script|generate (a )?script|(make|create) (a )?(youtube|video)/i.test(userMessage)) {
    try {
      const { runContentPipeline } = await import('./content-engine')
      const channel = /card|chiefz|hobby/i.test(userMessage) ? 'cardchiefz' : 'resumechiefz'
      await runContentPipeline(channel, 'youtube')
      return { agent: 'echo' as AgentName, message: `Script drafted for ${channel === 'cardchiefz' ? 'Card Chiefz' : 'ResumeChiefz'}, sir. Saved to Drive and posted to #jarvis for approval.` }
    } catch (err) {
      return { agent: 'echo' as AgentName, message: `Script failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
    }
  }

  if (/write (an? )?ebook|generate (an? )?ebook|create (an? )?ebook/i.test(userMessage)) {
    try {
      const { runContentPipeline } = await import('./content-engine')
      const channel = /card|chiefz|hobby/i.test(userMessage) ? 'cardchiefz' : 'resumechiefz'
      await runContentPipeline(channel, 'ebook')
      return { agent: 'echo' as AgentName, message: `Ebook drafted for ${channel === 'cardchiefz' ? 'Card Chiefz' : 'ResumeChiefz'}, sir. Full manuscript saved to Drive. Posted to #jarvis for your review.` }
    } catch (err) {
      return { agent: 'echo' as AgentName, message: `Ebook failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
    }
  }

  // ── Voice-to-action: trading journal ───────────────────────
  if (/trading patterns|how('?s| is) my trading|trade journal|trading journal analysis/i.test(userMessage)) {
    try {
      const { analyzeTradingPatterns } = await import('./trading-journal')
      const patterns = await analyzeTradingPatterns()
      return { agent: 'ledger' as AgentName, message: patterns }
    } catch (err) {
      return { agent: 'ledger' as AgentName, message: `Journal analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
    }
  }

  // ── News intel ─────────────────────────────────────────────
  if (/news|what.*happening|market news|any news|morning news/i.test(userMessage)) {
    try {
      const { runNewsIntel } = await import('./news-intel')
      await runNewsIntel()
      return { agent: 'scout' as AgentName, message: `News sweep done, sir. Filtered to what matters — posted to #jarvis.` }
    } catch (err) {
      return { agent: 'scout' as AgentName, message: `News intel failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
    }
  }

  const [context, route] = await Promise.all([
    getCachedContext(),
    Promise.resolve(detectRoute(userMessage)),
  ])

  const usesSonnet = needsSonnet(userMessage, route)
  const model = usesSonnet ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001'

  let agentIntel = ''
  let telemetryAgent: AgentName = 'jarvis'

  // ── Beckett live status — injected into SAGE responses ──────
  let beckettCtx = ''
  if (route === 'sage' || /beckett|son|custody|pickup|drop.?off|father|dad/i.test(userMessage)) {
    try {
      const { getBeckettContext } = await import('./beckett')
      beckettCtx = '\n\n' + await getBeckettContext()
    } catch { /* skip */ }
  }

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

  // ── Enrich context with new intelligence layers ───────────
  const [sentimentCtx, intentionCtx, whoopCtx] = await Promise.all([
    import('./sentiment-tracker').then(({ getCurrentSentimentContext }) => getCurrentSentimentContext()).catch(() => ''),
    import('./weekly-intention').then(({ getIntentionContext }) => getIntentionContext()).catch(() => ''),
    import('./whoop').then(({ getWhoopContext }) => getWhoopContext()).catch(() => ''),
  ])

  // ── Load AB's living profile ──────────────────────────────
  let profileCtx = ''
  try {
    const profile = await loadProfile()
    if (profile) {
      profileCtx = `\n\n[AB PROFILE]\nFocus: ${profile.currentFocus.join(', ')}\nGoals: ${profile.activeGoals.join(', ')}\nStyle: ${profile.communicationStyle}\nPatterns: ${profile.patterns.join(', ')}`
    }
  } catch { /* skip */ }

  // ── Semantic memory retrieval — find relevant past context ──
  let semanticCtx = ''
  try {
    const semanticMemories = await searchMemories(userMessage, { limit: 5, minSimilarity: 0.4 })
    if (semanticMemories.length > 0) {
      semanticCtx = '\n\n[RELEVANT MEMORIES]\n' + semanticMemories
        .map(m => `[${m.category}] ${m.content}`)
        .join('\n')
    }
  } catch { /* skip if not set up yet */ }

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
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: AGENT_SYSTEMS[route] + getAgentPersonalityPrompt(route) + context,
      messages: [{ role: 'user', content: userMessage }],
    }).then(r => r.content[0].type === 'text' ? r.content[0].text : '').catch(() => '')

    agentIntel = intel ? `\n\n[${route.toUpperCase()} INTEL]\n${intel}` : ''
    telemetryAgent = route
  }

  // When routing to a specific agent, let them speak in their own voice
  const isDirectRoute = route !== 'jarvis' && agentIntel
  const enrichment = sentimentCtx + intentionCtx + whoopCtx

  const systemPrompt = isDirectRoute
    ? (AGENT_SYSTEMS[route] ?? JARVIS_SYSTEM) + getAgentPersonalityPrompt(route) + context + profileCtx + beckettCtx + semanticCtx + liveData + enrichment
    : JARVIS_SYSTEM + context + profileCtx + beckettCtx + semanticCtx + liveData + enrichment + agentIntel +
      (agentIntel ? `\n\nDeliver as JARVIS — synthesized, crisp, in your voice. Call AB "sir" or "AB".` : '')

  const response = await anthropic.messages.create({
    model,
    max_tokens: usesSonnet ? 1200 : 400,
    system: systemPrompt,
    messages: [...history.slice(-4), { role: 'user', content: userMessage }],
  })

  const reply = response.content[0].type === 'text' ? response.content[0].text : ''

  // ── Post-response async enrichment — non-blocking ────────
  if (userMessage.length > 20) {
    Promise.all([
      // Save to vector memory
      saveMemory({
        category: 'conversation_summary',
        content: userMessage.slice(0, 200),
        context: reply.slice(0, 300),
        importance: 6,
      }).catch(() => supabaseAdmin.from('ai_memories').insert({
        category: 'conversation_summary',
        content: userMessage.slice(0, 200),
        context: reply.slice(0, 300),
        importance: 6,
        created_at: new Date().toISOString(),
      })),

      // Detect and log decisions
      import('./decision-journal').then(({ detectAndLogDecision }) =>
        detectAndLogDecision(userMessage, reply).catch(() => {})
      ).catch(() => {}),

      // Detect contact mentions
      import('./relationship-tracker').then(({ detectContactMention }) =>
        detectContactMention(userMessage, reply).catch(() => {})
      ).catch(() => {}),

      // Append to Google Docs conversation log
      import('./convo-to-docs').then(({ appendConversationToDoc }) =>
        appendConversationToDoc(userMessage, reply, telemetryAgent).catch(() => {})
      ).catch(() => {}),

      // Analyze sentiment from user message
      import('./sentiment-tracker').then(async ({ analyzeSentiment, saveSentimentReading }) => {
        const msgs = history.slice(-5).map(h => h.content).concat(userMessage)
        const reading = await analyzeSentiment(msgs)
        if (reading) await saveSentimentReading(reading)
      }).catch(() => {}),
    ]).catch(() => {})
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
