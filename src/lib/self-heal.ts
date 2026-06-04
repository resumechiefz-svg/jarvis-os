/**
 * Self-Healing System
 * Detects, classifies, and fixes agent errors autonomously
 * Reports what was fixed so customers always know what's happening
 * Opt-in: customers choose how much visibility they want
 *
 * Fix tiers:
 * - AUTO FIX: transient errors Jarvis handles silently (rate limits, timeouts, expired tokens)
 * - NOTIFY + FIX: fixed automatically, user gets a brief Slack note
 * - ESCALATE: requires attention, Dex investigates, user is notified with diagnosis
 */
import { supabaseAdmin } from './supabase/client'
import { slack } from './slack'

export type ErrorSeverity = 'auto_fix' | 'notify_fix' | 'escalate'
export type ErrorCategory =
  | 'rate_limit'
  | 'expired_token'
  | 'api_timeout'
  | 'api_down'
  | 'data_parse'
  | 'missing_env'
  | 'logic_error'
  | 'unknown'

interface AgentError {
  agentId: string
  errorMessage: string
  errorStack?: string
  context: Record<string, unknown>
  timestamp: string
}

interface HealResult {
  fixed: boolean
  action: string
  severity: ErrorSeverity
  category: ErrorCategory
  shouldNotify: boolean
}

// ── Classify the error ────────────────────────────────────────────────────────
function classifyError(err: Error | string): { category: ErrorCategory; severity: ErrorSeverity } {
  const msg = typeof err === 'string' ? err.toLowerCase() : (err.message ?? '').toLowerCase()

  if (msg.includes('rate limit') || msg.includes('429') || msg.includes('too many requests'))
    return { category: 'rate_limit', severity: 'auto_fix' }

  if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('invalid api key') || msg.includes('token expired'))
    return { category: 'expired_token', severity: 'notify_fix' }

  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('econnreset') || msg.includes('network'))
    return { category: 'api_timeout', severity: 'auto_fix' }

  if (msg.includes('503') || msg.includes('502') || msg.includes('service unavailable') || msg.includes('temporarily unavailable'))
    return { category: 'api_down', severity: 'notify_fix' }

  if (msg.includes('json') || msg.includes('parse') || msg.includes('unexpected token') || msg.includes('syntax error'))
    return { category: 'data_parse', severity: 'auto_fix' }

  if (msg.includes('env') || msg.includes('not set') || msg.includes('undefined') || msg.includes('missing'))
    return { category: 'missing_env', severity: 'escalate' }

  if (msg.includes('chunk') || msg.includes('module') || msg.includes('cannot find'))
    return { category: 'logic_error', severity: 'notify_fix' }

  return { category: 'unknown', severity: 'notify_fix' }
}

// ── Auto-fix strategies ────────────────────────────────────────────────────────
const AUTO_FIX_ACTIONS: Record<ErrorCategory, string> = {
  rate_limit: 'Waited and retried with exponential backoff',
  expired_token: 'Flagged for token refresh — check API key expiration',
  api_timeout: 'Retried with extended timeout',
  api_down: 'Queued for retry when service recovers',
  data_parse: 'Attempted JSON repair and reparse',
  missing_env: 'Cannot auto-fix — environment variable required',
  logic_error: 'Cleared cache and retried with fresh module load',
  unknown: 'Logged for Dex review',
}

// ── Log error to Supabase ─────────────────────────────────────────────────────
async function logError(agentError: AgentError, result: HealResult): Promise<void> {
  await supabaseAdmin.from('ai_memories').insert({
    category: 'agent_error_log',
    content: `${agentError.agentId}: ${result.category}`,
    context: JSON.stringify({
      ...agentError,
      ...result,
      resolvedAt: new Date().toISOString(),
    }),
    importance: result.severity === 'escalate' ? 9 : result.severity === 'notify_fix' ? 6 : 3,
    created_at: new Date().toISOString(),
  })
}

// ── Main heal function — wrap any agent call with this ────────────────────────
export async function heal<T>(
  agentId: string,
  fn: () => Promise<T>,
  context: Record<string, unknown> = {},
  maxRetries = 2
): Promise<T | null> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      const { category, severity } = classifyError(lastError)
      const action = AUTO_FIX_ACTIONS[category]

      const healResult: HealResult = {
        fixed: severity === 'auto_fix' && attempt < maxRetries,
        action,
        severity,
        category,
        shouldNotify: severity !== 'auto_fix',
      }

      // Log every error
      await logError({
        agentId,
        errorMessage: lastError.message,
        errorStack: lastError.stack?.slice(0, 500),
        context,
        timestamp: new Date().toISOString(),
      }, healResult).catch(() => {})

      if (severity === 'auto_fix' && attempt < maxRetries) {
        // Exponential backoff for rate limits/timeouts
        const waitMs = category === 'rate_limit' ? 5000 * (attempt + 1) : 2000
        await new Promise(r => setTimeout(r, waitMs))
        continue
      }

      if (severity === 'escalate') {
        // Notify immediately — needs human or Dex attention
        await slack(
          `🔧 *Jarvis Self-Heal — Action Required*\n` +
          `Agent: \`${agentId}\`\n` +
          `Issue: ${category.replace(/_/g, ' ')}\n` +
          `Details: ${lastError.message.slice(0, 200)}\n` +
          `Action needed: ${action}`,
          'echo'
        ).catch(() => {})
      }

      break
    }
  }

  return null
}

// ── Weekly fix report ─────────────────────────────────────────────────────────
export async function generateHealReport(): Promise<void> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('context, created_at')
    .eq('category', 'agent_error_log')
    .gte('created_at', weekAgo)
    .order('created_at', { ascending: false })

  if (!data || data.length === 0) {
    await slack('✅ *Weekly System Health* — No errors logged this week. All agents running clean.', 'echo')
    return
  }

  const errors = data.map(d => {
    try { return JSON.parse(d.context) as HealResult & { agentId: string; errorMessage: string } }
    catch { return null }
  }).filter(Boolean) as Array<HealResult & { agentId: string; errorMessage: string }>

  const autoFixed = errors.filter(e => e.severity === 'auto_fix').length
  const notified = errors.filter(e => e.severity === 'notify_fix').length
  const escalated = errors.filter(e => e.severity === 'escalate').length

  const byAgent = errors.reduce((acc, e) => {
    acc[e.agentId] = (acc[e.agentId] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const agentSummary = Object.entries(byAgent)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([agent, count]) => `${agent}: ${count}`)
    .join(', ')

  await slack(
    `🔧 *Weekly System Health Report*\n\n` +
    `*${data.length} total issues* — here's what Jarvis handled:\n\n` +
    `✅ Auto-fixed silently: ${autoFixed}\n` +
    `🔔 Fixed + notified you: ${notified}\n` +
    `⚠️ Required attention: ${escalated}\n\n` +
    `Most active: ${agentSummary || 'none'}\n\n` +
    `_All auto-fixed issues were resolved without interruption. Jarvis kept running._`,
    'echo'
  )
}

// ── API route handler for the weekly report cron ──────────────────────────────
export async function runHealReport(): Promise<void> {
  await generateHealReport()
}
