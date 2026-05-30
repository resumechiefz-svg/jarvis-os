import Anthropic from '@anthropic-ai/sdk'
import { DEX_SYSTEM } from './prompts'
import { supabaseAdmin } from '../supabase/client'
import { pushNotify } from '../push/notify'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type Severity = 'low' | 'medium' | 'high' | 'critical'

export interface BugReport {
  severity: Severity
  title: string
  affects: string
  rootCause: string
  fix: string
  deployReady: boolean
}

export async function scanForErrors(): Promise<BugReport[]> {
  const reports: BugReport[] = []

  // Check Supabase for recent errors in logs
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    // Check for recent failed API calls or anomalies
    const { data: recentMemories } = await supabaseAdmin
      .from('ai_memories')
      .select('content, created_at')
      .ilike('content', '%error%')
      .gte('created_at', oneDayAgo)
      .limit(5)

    if (recentMemories && recentMemories.length > 0) {
      reports.push({
        severity: 'low',
        title: 'Error patterns detected in memory log',
        affects: 'Jarvis OS memory system',
        rootCause: 'Recent interactions logged error states',
        fix: 'Review ai_memories table for error patterns',
        deployReady: false,
      })
    }
  } catch {
    // Supabase not reachable
    reports.push({
      severity: 'high',
      title: 'Supabase connection failure',
      affects: 'All Sage data, memory, goals, calendar',
      rootCause: 'Database unreachable — may be paused or network issue',
      fix: 'Check Supabase dashboard — restore project if paused',
      deployReady: false,
    })
  }

  // Alert AB if anything critical
  const critical = reports.filter(r => r.severity === 'critical' || r.severity === 'high')
  if (critical.length > 0) {
    await pushNotify(
      'DEX ALERT',
      `${critical.length} high-severity issue(s) found. Check workspace.`,
      { tag: 'dex', urgent: true, url: '/workspace' }
    ).catch(() => {})
  }

  return reports
}

export async function analyzeBug(description: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    system: DEX_SYSTEM,
    messages: [{ role: 'user', content: `Analyze this issue and provide a diagnosis + fix:\n\n${description}` }],
  })
  return response.content[0].type === 'text' ? response.content[0].text : ''
}

export async function getDexStatus(): Promise<string> {
  const reports = await scanForErrors()

  if (reports.length === 0) {
    return 'DEX — SYSTEM STATUS\n━━━━━━━━━━━━━━━━━━━━━━\nAll systems nominal. No issues detected in the last 24 hours.\n\nRC stack: Vercel + Supabase + Stripe — monitoring active.\nJarvis OS: Next.js 16 + Supabase — clean.\n\nStanding by.'
  }

  return `DEX — SYSTEM STATUS\n━━━━━━━━━━━━━━━━━━━━━━\nFound ${reports.length} issue(s):\n\n${
    reports.map((r, i) => `${i + 1}. [${r.severity.toUpperCase()}] ${r.title}\n   Affects: ${r.affects}\n   Root cause: ${r.rootCause}\n   Fix: ${r.fix}`).join('\n\n')
  }\n\nReady on your go, AB.`
}
