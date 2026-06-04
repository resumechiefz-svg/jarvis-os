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

function detectRoute(message: string, history?: Array<{ role: string }>): AgentName {
  const lower = message.toLowerCase()

  // "Dex, take the wheel" is intercepted client-side — if it leaks through, return jarvis
  if (lower.includes('take the wheel') || lower.includes('take control') || lower.includes('computer mode')) return 'jarvis'

  // Always keep Jarvis for short conversational messages — never hijack mid-chat
  if (message.length < 20) return 'jarvis'
  // If already in a conversation, require explicit agent name to switch
  if (history && history.length >= 4) {
    const EXPLICIT = ['nova','sage','vault','echo','scout','lister','dex','beacon','ledger','atlas','reel']
    if (!EXPLICIT.some(a => lower.includes(a))) return 'jarvis'
  }

  if (lower.includes('stripe') || lower.includes('mrr') || lower.includes('subscriber') || lower.includes('nova') || lower.includes('resumechiefz revenue') || lower.includes('conversion')) return 'nova'
  // ── Sage / Personal ─────────────────────────────────────────────────────
  if (lower.includes('sage') || lower.includes('beckett') || lower.includes('custody') ||
      lower.includes('morning brief') || lower.includes('my week') ||
      lower.includes('pickup') || lower.includes('drop off') || lower.includes('drop-off')) return 'sage'

  // ── Nova / ResumeChiefz revenue ──────────────────────────────────────────
  if (lower.includes('nova') ||
      lower.includes('resumechiefz revenue') || lower.includes('resumechiefz mrr') ||
      lower.includes('rc revenue') || lower.includes('rc mrr') || lower.includes('rc stats') ||
      lower.includes('rc numbers') || lower.includes('stripe') ||
      (lower.includes('mrr') && lower.includes('resumechiefz'))) return 'nova'

  // ── Vault / Card Chiefz eBay ─────────────────────────────────────────────
  if (lower.includes('vault') || lower.includes('card chiefz') || lower.includes('ebay') ||
      lower.includes('cc sales') || lower.includes('card sales') ||
      (lower.includes('listing') && (lower.includes('ebay') || lower.includes('card')))) return 'vault'

  // ── Echo / Content ───────────────────────────────────────────────────────
  if (lower.includes('echo') || lower.includes('linkedin post') || lower.includes('rc outreach') ||
      lower.includes('resumechiefz content') || lower.includes('blog post') ||
      lower.includes('write a post') || lower.includes('draft a post') ||
      lower.includes('content plan')) return 'echo'

  // ── Reel ─────────────────────────────────────────────────────────────────
  if (lower.includes('reel') || lower.includes('cc post') || lower.includes('card chiefz content')) return 'reel'

  // ── Scout / Growth ───────────────────────────────────────────────────────
  if (lower.includes('scout') || lower.includes('reddit growth') || lower.includes('seo report') ||
      lower.includes('traffic report') || lower.includes('growth report')) return 'scout'

  // ── Lister ───────────────────────────────────────────────────────────────
  if (lower.includes('lister') || lower.includes('format listing') || lower.includes('ebay listing') ||
      lower.includes('create a listing') || lower.includes('make a listing')) return 'lister'

  // ── Dex / System errors ──────────────────────────────────────────────────
  if (lower.includes('dex') || lower.includes('site down') ||
      (lower.includes('bug') && lower.includes('fix')) ||
      (lower.includes('error') && lower.includes('site'))) return 'dex'

  // ── Beacon / Goals ───────────────────────────────────────────────────────
  if (lower.includes('beacon') || lower.includes('goal velocity') ||
      lower.includes('accountability check') || lower.includes('weekly accountability') ||
      lower.includes('am i on track') || lower.includes('on track for')) return 'beacon'

  // ── Ledger / Finances ────────────────────────────────────────────────────
  if (lower.includes('ledger') || lower.includes('financial snapshot') ||
      lower.includes('bills overview') || lower.includes('net worth') ||
      lower.includes('savings rate')) return 'ledger'

  // ── Atlas / Strategy ─────────────────────────────────────────────────────
  if (lower.includes('atlas') || lower.includes('market intel') ||
      lower.includes('business idea') || lower.includes('acquisition') ||
      lower.includes('seven figure') || lower.includes('7 figure') ||
      lower.includes('7-figure roadmap')) return 'atlas'

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
  // Strip barge-in prefix before routing — handle it naturally in context
  const isBargeIn = userMessage.startsWith('[I interrupted you]')
  const cleanMessage = isBargeIn ? userMessage.replace('[I interrupted you]', '').trim() : userMessage
  if (isBargeIn) userMessage = cleanMessage

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
  if (/post to linkedin|linkedin post|share on linkedin|post to twitter|tweet this|post to social|post this/i.test(userMessage)) {
    try {
      const { postToLinkedInBuffer, postToTwitterBuffer } = await import('./buffer-social')
      const content = userMessage
        .replace(/post (this |to |on )?(linkedin|twitter|social):?/i, '')
        .replace(/tweet (this:?)?/i, '')
        .trim()
      if (!content || content.length < 10) return { agent: 'echo' as AgentName, message: 'What would you like me to post? Give me the content.' }

      const toLinkedIn = /linkedin|social/i.test(userMessage)
      const toTwitter = /twitter|tweet|social/i.test(userMessage)

      const results: string[] = []
      if (toLinkedIn) {
        const r = await postToLinkedInBuffer(content)
        results.push(r.success ? 'LinkedIn ✓ queued in Buffer' : `LinkedIn failed: ${r.error}`)
      }
      if (toTwitter) {
        const r = await postToTwitterBuffer(content.slice(0, 240))
        results.push(r.success ? 'Twitter ✓ queued in Buffer' : `Twitter failed: ${r.error}`)
      }
      return { agent: 'echo' as AgentName, message: results.join(' | ') }
    } catch (err) {
      return { agent: 'echo' as AgentName, message: `Social post failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
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

  // ── Voice-to-action: FORGE self-improvement ───────────────
  if (/what.*fix|what.*update|what.*change|forge.*scan|self.*(heal|improv|fix)|what.*you.*do.*today|update.*yourself|fix.*yourself/i.test(userMessage)) {
    try {
      const { getChangeLog } = await import('./forge')
      const days = /week/i.test(userMessage) ? 7 : /month/i.test(userMessage) ? 30 : 7
      const log = await getChangeLog(days)
      return { agent: 'jarvis' as AgentName, message: log }
    } catch { /* fall through */ }
  }

  if (/what.*need.*fix|what.*broken|what.*recommend|run.*forge|scan.*yourself|find.*issues|diagnose/i.test(userMessage)) {
    try {
      const { runForgeScsan } = await import('./forge')
      runForgeScsan().catch(() => {})
      return { agent: 'atlas' as AgentName, message: `Running a full system scan now. I'll check error logs, agent failures, and conversation patterns for anything that needs fixing. Results in #jarvis in a couple minutes.` }
    } catch { /* fall through */ }
  }

  // ── Voice-to-action: Post pending eBay draft ──────────────
  if (/post it|list it|go ahead.*list|post.*draft|list.*draft/i.test(userMessage)) {
    try {
      const { postPendingDraft } = await import('./photo-to-listing')
      postPendingDraft().catch(() => {})
      return { agent: 'lister' as AgentName, message: `Posting to eBay now — I'll send you the link in #jarvis when it's live.` }
    } catch { /* fall through */ }
  }

  // ── Voice-to-action: Competitor scan ──────────────────────
  if (/competitor|what.*(kickresume|zety|resume\.io)|comp.*scan|intel.*report/i.test(userMessage)) {
    try {
      const { runCompetitorIntel } = await import('./competitor-intel')
      runCompetitorIntel().catch(() => {})
      return { agent: 'atlas' as AgentName, message: `Running competitor scan now. I'll scrape their pricing pages, compare against last week, and post the full intel report to #jarvis in a couple minutes.` }
    } catch { /* fall through */ }
  }

  // ── Voice-to-action: Habit logging ────────────────────────
  if (/logged|mark(ed)?|done|finished|completed|did my/i.test(userMessage) && /habit|read|cold|plunge|meditat|journal|study|gratitude|phone/i.test(userMessage)) {
    try {
      const { logHabit, getDailyHabitStatus } = await import('./habit-tracker')
      const habitMap: Record<string, string> = {
        read: 'reading', reading: 'reading',
        cold: 'cold_plunge', plunge: 'cold_plunge',
        phone: 'no_phone_morning',
        study: 'study', cert: 'study',
        journal: 'gratitude', gratitude: 'gratitude', meditat: 'gratitude',
      }
      const lower = userMessage.toLowerCase()
      const matched = Object.entries(habitMap).find(([k]) => lower.includes(k))
      if (matched) {
        await logHabit(matched[1])
        const status = await getDailyHabitStatus()
        return { agent: 'sage' as AgentName, message: `Logged. ${status.missing.length === 0 ? 'Clean sweep today — every habit done.' : `${status.completed.length} done, ${status.missing.length} left: ${status.missing.join(', ')}.`}` }
      }
    } catch { /* fall through */ }
  }

  // ── Voice-to-action: Habit status ─────────────────────────
  if (/habit(s)?|streak(s)?|how.*doing.*habits/i.test(userMessage)) {
    try {
      const { getDailyHabitStatus } = await import('./habit-tracker')
      const { completed, missing, streaks } = await getDailyHabitStatus()
      const topStreak = Object.entries(streaks).sort(([,a],[,b]) => b - a)[0]
      const msg = missing.length === 0
        ? `All habits done today. ${topStreak ? `Best streak: ${topStreak[0]} at ${topStreak[1]} days.` : ''}`
        : `${completed.length} done, ${missing.length} still open — ${missing.join(', ')}. ${topStreak ? `Best streak going: ${topStreak[0]} at ${topStreak[1]} days.` : ''}`
      return { agent: 'sage' as AgentName, message: msg }
    } catch { /* fall through */ }
  }

  // ── Voice-to-action: Full YouTube video pipeline ───────────
  // ── Career/Life path planning ─────────────────────────────────────────
  if (/(how do i|steps to|path to|plan for|want to start|how to become|guide me|walk me through|help me (start|become|build|launch|get into))/i.test(userMessage)) {
    try {
      const { generatePath, formatPathForSlack } = await import('./pathfinder')
      const { slack } = await import('../slack')
      const goal = userMessage.replace(/^(how do i|steps to|path to|plan for|help me|guide me|walk me through)\s+/i, '').trim()

      // Generate async — don't block the voice response
      generatePath(goal, 'Starting fresh').then(async path => {
        const msg = formatPathForSlack(path)
        await slack(msg, 'echo')
      }).catch(() => {})

      return {
        agent: 'jarvis' as AgentName,
        message: `I'll map that out for you. Give me a moment to research the requirements, licensing, certifications, and steps specific to that path. It'll be in your Slack shortly with everything laid out — quick wins for today, the full roadmap, and what you can't skip.`,
      }
    } catch { /* fall through to normal response */ }
  }

  // ── Relationship / meeting brief ──────────────────────────────────────────
  if (/(meeting with|brief on|who is|remind me about|before i meet|tell me about) ([A-Z][a-z]+ [A-Z][a-z]+|[A-Z][a-z]+)/i.test(userMessage)) {
    try {
      const { getMeetingBrief } = await import('./relationships')
      const nameMatch = userMessage.match(/(meeting with|brief on|who is|remind me about|before i meet|tell me about) ([A-Z][a-z]+(?: [A-Z][a-z]+)?)/i)
      const name = nameMatch?.[2]?.trim()

      if (name) {
        const brief = await getMeetingBrief('ab', name)
        return { agent: 'sage' as AgentName, message: brief }
      }
    } catch { /* fall through */ }
  }

  // ── Instagram carousel ─────────────────────────────────────────
  if (/(make|create|generate|run) (an? )?(instagram |ig )?carousel|ig post|instagram post|instagram carousel/i.test(userMessage)) {
    try {
      const { runCarouselPipeline } = await import('./carousel')
      const channel = /card|chiefz|hobby/i.test(userMessage) ? 'cardchiefz' as const : 'resumechiefz' as const
      runCarouselPipeline(channel).catch(() => {})
      return { agent: 'echo' as AgentName, message: `On it, sir. Picking a viral topic, writing the slides, generating images. Chrome will open with the finished carousel for your review — approve and it queues to Buffer automatically.` }
    } catch (err) {
      return { agent: 'echo' as AgentName, message: `Carousel failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
    }
  }

  if (/(make|create|produce|generate|run) (a )?(full |complete )?(youtube )?video|full video pipeline|youtube pipeline/i.test(userMessage)) {
    try {
      const { runFullPipeline } = await import('./youtube-pipeline')
      const channel = /card|chiefz|hobby/i.test(userMessage) ? 'cardchiefz' as const : 'resumechiefz' as const
      const themeMatch = userMessage.match(/(?:theme|style)[:\s]+([a-z\s]+?)(?:\s|$)/i)
      const theme = themeMatch?.[1]?.trim() ?? 'cinematic'
      const topicMatch = userMessage.match(/(?:about|on|topic)[:\s]+(.+?)(?:\s+for|\s+using|$)/i)
      const topic = topicMatch?.[1]?.trim()
      runFullPipeline(channel, topic, theme).catch(() => {})
      return { agent: 'echo' as AgentName, message: `Pipeline started, sir. I'll generate the script, images, voiceover, animation, and assemble the final video. You'll get updates in #jarvis as each phase completes. React ✅ when it's assembled and I'll upload it to YouTube automatically.` }
    } catch (err) {
      return { agent: 'echo' as AgentName, message: `Pipeline failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
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

  // ── Weather ────────────────────────────────────────────────
  if (/weather|temperature|forecast|how.*hot|how.*cold|raining|sunny|gonna rain|outside like/i.test(userMessage)) {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'}/api/weather`)
      const w = await res.json() as { summary?: string; temp?: number; condition?: string; error?: string }
      if (w.error) return { agent: 'jarvis' as AgentName, message: `Weather unavailable right now, sir.` }
      return { agent: 'jarvis' as AgentName, message: w.summary ?? `${w.temp}° and ${w.condition} in Charlotte.`, card: 'weather' }
    } catch {
      return { agent: 'jarvis' as AgentName, message: `Couldn't reach weather service, sir.` }
    }
  }

  // ── News intel ─────────────────────────────────────────────
  if (/top news|news brief|headlines|what.*happening|market news|any news|morning news|overnight news/i.test(userMessage)) {
    try {
      // Fetch live headlines directly and speak them
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'}/api/news`)
      const headlines = await res.json() as Array<{ headline: string; source: string }>
      if (Array.isArray(headlines) && headlines.length > 0) {
        const top5 = headlines.slice(0, 5).map((h, i) => `${i + 1}. ${h.headline}`).join(' ')
        return { agent: 'scout' as AgentName, message: `Here are your top headlines: ${top5}`, card: 'news' }
      }
      const { runNewsIntel } = await import('./news-intel')
      await runNewsIntel()
      return { agent: 'scout' as AgentName, message: `News sweep done, sir. Top stories posted to Slack.` }
    } catch (err) {
      return { agent: 'scout' as AgentName, message: `News intel failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
    }
  }

  const [context, route] = await Promise.all([
    getCachedContext(),
    Promise.resolve(detectRoute(userMessage, history)),
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

// ── Streaming chat — yields SSE events token by token ─────────────────────────
export type StreamEvent =
  | { type: 'agent'; agent: AgentName }
  | { type: 'delta'; text: string }
  | { type: 'done'; fullText: string; card?: 'weather' | 'news' }
  | { type: 'error'; message: string }

async function* yieldStatic(agent: AgentName, message: string, card?: 'weather' | 'news'): AsyncGenerator<StreamEvent> {
  yield { type: 'agent', agent }
  yield { type: 'delta', text: message }
  yield { type: 'done', fullText: message, ...(card ? { card } : {}) }
}

export async function* chatStream(
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): AsyncGenerator<StreamEvent> {
  // Strip barge-in prefix — Jarvis handles naturally via conversation context
  if (userMessage.startsWith('[I interrupted you]')) {
    userMessage = userMessage.replace('[I interrupted you]', '').trim()
  }
  // For all special-cased routes (habits, email, calendar, etc.) — delegate to
  // the blocking chat() and stream the result as a single chunk
  const isSpecial =
    /^(yes,?\s*)?(send|send it|go ahead|confirmed?|do it)\.?$/i.test(userMessage.trim()) ||
    /schedule|add to (my )?calendar|create (an? )?event|book.*meeting/i.test(userMessage) ||
    /churn|at.risk|cancel|losing subscribers/i.test(userMessage) ||
    /post to linkedin|linkedin post|share on linkedin/i.test(userMessage) ||
    /draft (an? )?email|write (an? )?email|email to|send (an? )?email/i.test(userMessage) ||
    /habit|streak|how.*doing.*habit|logged|marked?|done|completed|did my/i.test(userMessage) ||
    /goal velocity|on track|financial independence/i.test(userMessage) ||
    /write.*blog|blog.*post|auto.?blog/i.test(userMessage) ||
    /revenue opportunity|atlas.*opportunity/i.test(userMessage) ||
    /what.*fix|forge.*scan|self.*(heal|improv)/i.test(userMessage) ||
    /competitor|comp.*scan|market intel/i.test(userMessage) ||
    /trading patterns|trade journal/i.test(userMessage) ||
    /(make|create|produce) (a )?(full )?(youtube )?video|youtube pipeline/i.test(userMessage) ||
    /remember\s*(that|this|:)?/i.test(userMessage) ||
    /weather|temperature|forecast|how.*hot|how.*cold|raining|sunny|gonna rain|outside like/i.test(userMessage) ||
    /top news|news brief|headlines|what.*happening|market news|any news|morning news|overnight news/i.test(userMessage)

  if (isSpecial) {
    try {
      const result = await chat(userMessage, history)
      yield* yieldStatic(result.agent, result.message, result.card)
    } catch (err) {
      yield { type: 'error', message: String(err) }
    }
    return
  }

  // Direct agent address — "Nova, what's going on?"
  const directAgent = detectDirectAgentAddress(userMessage)
  if (directAgent) {
    const stripped = userMessage.replace(new RegExp(`^${directAgent}[,\\s]+`, 'i'), '').trim() || 'what are you working on?'
    yield { type: 'agent', agent: directAgent as AgentName }
    const agentSystemMap: Record<string, string> = {
      jarvis: JARVIS_SYSTEM, nova: NOVA_SYSTEM, sage: SAGE_SYSTEM, vault: VAULT_SYSTEM,
      echo: ECHO_SYSTEM, reel: REEL_SYSTEM, scout: SCOUT_SYSTEM, lister: LISTER_SYSTEM,
      dex: DEX_SYSTEM, beacon: BEACON_SYSTEM, ledger: LEDGER_SYSTEM, atlas: ATLAS_SYSTEM,
    }
    let full = ''
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6', max_tokens: 600,
      system: (agentSystemMap[directAgent] ?? JARVIS_SYSTEM) + getAgentPersonalityPrompt(directAgent) + '\n\nRespond in your own voice. Stay in character.',
      messages: [...history.slice(-6).map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })), { role: 'user', content: stripped }],
    })
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        full += event.delta.text; yield { type: 'delta', text: event.delta.text }
      }
    }
    yield { type: 'done', fullText: full }
    return
  }

  // Main path — route, enrich, stream
  const route = detectRoute(userMessage, history)
  const usesSonnet = needsSonnet(userMessage, route)
  const model = usesSonnet ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001'
  const telemetryAgent: AgentName = route !== 'jarvis' ? route : 'jarvis'
  yield { type: 'agent', agent: telemetryAgent }

  // Parallel context fetch
  let agentIntel = '', beckettCtx = '', liveData = '', profileCtx = '', semanticCtx = ''
  let sentimentCtx = '', intentionCtx = '', whoopCtx = ''

  const [context] = await Promise.all([
    getCachedContext(),
    (async () => {
      if (route === 'sage' || /beckett|son|custody|pickup|father|dad/i.test(userMessage)) {
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
      try { const mems = await searchMemories(userMessage, { limit: 5, minSimilarity: 0.4 }); if (mems.length) semanticCtx = '\n\n[RELEVANT MEMORIES]\n' + mems.map(m => `[${m.category}] ${m.content}`).join('\n') } catch { /* skip */ }
    })(),
    import('./sentiment-tracker').then(({ getCurrentSentimentContext: g }) => g().then(r => { sentimentCtx = r }).catch(() => {})).catch(() => {}),
    import('./weekly-intention').then(({ getIntentionContext: g }) => g().then(r => { intentionCtx = r }).catch(() => {})).catch(() => {}),
    import('./whoop').then(({ getWhoopContext: g }) => g().then(r => { whoopCtx = r }).catch(() => {})).catch(() => {}),
  ])

  if (route !== 'jarvis' && AGENT_SYSTEMS[route] && usesSonnet) {
    agentIntel = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 600,
      system: AGENT_SYSTEMS[route] + getAgentPersonalityPrompt(route) + context,
      messages: [{ role: 'user', content: userMessage }],
    }).then(r => r.content[0].type === 'text' ? `\n\n[${route.toUpperCase()} INTEL]\n${r.content[0].text}` : '').catch(() => '')
  }

  const isDirectRoute = route !== 'jarvis' && !!agentIntel
  const enrichment = sentimentCtx + intentionCtx + whoopCtx
  const systemPrompt = isDirectRoute
    ? (AGENT_SYSTEMS[route] ?? JARVIS_SYSTEM) + getAgentPersonalityPrompt(route) + context + profileCtx + beckettCtx + semanticCtx + liveData + enrichment
    : JARVIS_SYSTEM + context + profileCtx + beckettCtx + semanticCtx + liveData + enrichment + agentIntel +
      (agentIntel ? '\n\nDeliver as JARVIS — synthesized, crisp. Call AB "sir" or "AB".' : '')

  let fullText = ''
  const stream = anthropic.messages.stream({
    model, max_tokens: usesSonnet ? 1200 : 400,
    system: systemPrompt,
    messages: [...history.slice(-4), { role: 'user', content: userMessage }],
  })
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      fullText += event.delta.text; yield { type: 'delta', text: event.delta.text }
    }
  }

  const clean = fullText.replace(/^#{1,3}\s+/gm, '').replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').replace(/^---+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
  yield { type: 'done', fullText: clean }

  // Post-response async enrichment
  if (userMessage.length > 20) {
    Promise.all([
      saveMemory({ category: 'conversation_summary', content: userMessage.slice(0, 200), context: clean.slice(0, 300), importance: 6 }).catch(() => supabaseAdmin.from('ai_memories').insert({ category: 'conversation_summary', content: userMessage.slice(0, 200), context: clean.slice(0, 300), importance: 6, created_at: new Date().toISOString() })),
      import('./decision-journal').then(({ detectAndLogDecision: f }) => f(userMessage, clean).catch(() => {})).catch(() => {}),
      import('./relationship-tracker').then(({ detectContactMention: f }) => f(userMessage, clean).catch(() => {})).catch(() => {}),
    ]).catch(() => {})
  }
}
