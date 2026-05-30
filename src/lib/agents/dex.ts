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

// ── Production sites DEX monitors ────────────────────────────────────────────
const MONITORED_SITES = [
  {
    name: 'ResumeChiefz',
    url: 'https://resumechiefz.com',
    criticalPaths: ['/', '/app.html', '/blog.html'],
    vercelProject: 'resumechiefz',
    maxResponseMs: 3000,
  },
  {
    name: 'Card Chiefz',
    url: 'https://cardchiefz.com',
    criticalPaths: ['/', '/blog'],
    vercelProject: 'cardchiefz',
    maxResponseMs: 3000,
  },
  {
    name: 'Jarvis OS',
    url: 'http://localhost:3001',
    criticalPaths: ['/api/nova', '/api/sage'],
    vercelProject: 'jarvis-os',
    maxResponseMs: 5000,
  },
]

export interface SiteHealth {
  site: string
  url: string
  status: 'healthy' | 'degraded' | 'down'
  statusCode: number | null
  responseMs: number | null
  failedPaths: string[]
  error?: string
  autoFixed: boolean
  fixAttempted: boolean
}

// ── Check a single site ───────────────────────────────────────────────────────
async function checkSite(site: typeof MONITORED_SITES[0]): Promise<SiteHealth> {
  const health: SiteHealth = {
    site: site.name,
    url: site.url,
    status: 'healthy',
    statusCode: null,
    responseMs: null,
    failedPaths: [],
    autoFixed: false,
    fixAttempted: false,
  }

  try {
    // Check main URL
    const start = Date.now()
    const res = await fetch(site.url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'JarvisDEX/1.0 (site monitor)' },
    })
    health.responseMs = Date.now() - start
    health.statusCode = res.status

    if (!res.ok) {
      health.status = 'down'
      health.error = `HTTP ${res.status} from ${site.url}`
    } else if (health.responseMs > site.maxResponseMs) {
      health.status = 'degraded'
      health.error = `Slow response: ${health.responseMs}ms (threshold: ${site.maxResponseMs}ms)`
    }

    // Check critical sub-paths (skip for localhost)
    if (!site.url.includes('localhost')) {
      for (const path of site.criticalPaths.slice(1)) {
        try {
          const pathRes = await fetch(`${site.url}${path}`, {
            signal: AbortSignal.timeout(5000),
          })
          if (!pathRes.ok) health.failedPaths.push(path)
        } catch {
          health.failedPaths.push(path)
        }
      }
    }

    if (health.failedPaths.length > 0 && health.status === 'healthy') {
      health.status = 'degraded'
    }

  } catch (err) {
    health.status = 'down'
    health.error = err instanceof Error ? err.message : 'Connection failed'
    health.statusCode = null
  }

  return health
}

// ── Auto-redeploy via Vercel CLI when site is down ────────────────────────────
async function attemptAutoFix(site: typeof MONITORED_SITES[0], health: SiteHealth): Promise<boolean> {
  if (site.url.includes('localhost')) return false // Don't redeploy local

  const vercelToken = process.env.VERCEL_TOKEN
  const teamId = process.env.VERCEL_TEAM_ID

  if (!vercelToken) return false

  try {
    // Trigger a redeployment of the latest production deployment
    const deploymentsRes = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${site.vercelProject}&target=production&limit=1${teamId ? `&teamId=${teamId}` : ''}`,
      { headers: { Authorization: `Bearer ${vercelToken}` } }
    )

    if (!deploymentsRes.ok) return false
    const deploymentsData = await deploymentsRes.json() as { deployments?: Array<{ uid: string }> }
    const latestDeployment = deploymentsData.deployments?.[0]
    if (!latestDeployment) return false

    // Redeploy
    const redeployRes = await fetch(
      `https://api.vercel.com/v13/deployments/${latestDeployment.uid}/redeploy${teamId ? `?teamId=${teamId}` : ''}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${vercelToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'production' }),
      }
    )

    return redeployRes.ok
  } catch {
    return false
  }
}

// ── Post to Slack ─────────────────────────────────────────────────────────────
async function postDexAlert(text: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: '#dex', text }),
  }).catch(() => {})
}

// ── Main site monitoring run ──────────────────────────────────────────────────
export async function runSiteMonitor(): Promise<SiteHealth[]> {
  const results = await Promise.all(MONITORED_SITES.map(checkSite))
  const issues = results.filter(r => r.status !== 'healthy')

  for (const health of issues) {
    const site = MONITORED_SITES.find(s => s.name === health.site)!

    // Attempt auto-fix for down sites
    if (health.status === 'down' && !site.url.includes('localhost')) {
      health.fixAttempted = true
      health.autoFixed = await attemptAutoFix(site, health)
    }

    // Classify severity
    const severity: Severity = health.status === 'down' ? 'critical' : 'medium'

    // Slack alert
    const emoji = severity === 'critical' ? '🔴' : '🟡'
    const fixNote = health.fixAttempted
      ? health.autoFixed
        ? '\n✅ *Auto-redeploy triggered.* Monitoring recovery...'
        : '\n⚠️ Auto-fix failed — manual intervention may be needed.'
      : ''

    await postDexAlert(
      `${emoji} *[DEX] ${health.site} — ${health.status.toUpperCase()}*\n` +
      `URL: ${health.url}\n` +
      `Status: ${health.statusCode ?? 'No response'} | Response: ${health.responseMs ? `${health.responseMs}ms` : 'timeout'}\n` +
      (health.error ? `Error: ${health.error}\n` : '') +
      (health.failedPaths.length ? `Failed paths: ${health.failedPaths.join(', ')}\n` : '') +
      fixNote
    )

    // Push notification for critical
    if (severity === 'critical') {
      await pushNotify(
        `DEX — ${health.site} is DOWN`,
        health.autoFixed
          ? 'Auto-redeploy triggered. Watching recovery.'
          : `${health.error ?? 'Site unreachable'}. Check #dex in Slack.`,
        { tag: 'dex', urgent: true, url: '/workspace' }
      ).catch(() => {})
    }

    // Log to Supabase (fire and forget)
    void supabaseAdmin.from('ai_memories').insert({
      category: 'dex_site_alert',
      content: `${health.site} ${health.status}: ${health.error ?? 'degraded performance'}`,
      context: JSON.stringify({ url: health.url, statusCode: health.statusCode, responseMs: health.responseMs, autoFixed: health.autoFixed }),
      importance: severity === 'critical' ? 9 : 6,
      created_at: new Date().toISOString(),
    })
  }

  // Post clean bill of health to Slack once a day (not every cycle)
  const hour = new Date().getHours()
  const min = new Date().getMinutes()
  if (issues.length === 0 && hour === 9 && min < 15) {
    await postDexAlert(
      '✅ *[DEX] Daily Site Check — All Systems Healthy*\n' +
      results.map(r => `• ${r.site}: ${r.statusCode} (${r.responseMs}ms)`).join('\n')
    )
  }

  return results
}

// ── Internal error scanner (Supabase/memory errors) ──────────────────────────
export async function scanForErrors(): Promise<BugReport[]> {
  const reports: BugReport[] = []

  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: recentMemories } = await supabaseAdmin
      .from('ai_memories')
      .select('content, created_at')
      .ilike('content', '%error%')
      .gte('created_at', oneDayAgo)
      .limit(5)

    if (recentMemories && recentMemories.length > 0) {
      reports.push({
        severity: 'low',
        title: 'Error patterns in memory log',
        affects: 'Jarvis OS memory system',
        rootCause: 'Recent interactions logged error states',
        fix: 'Review ai_memories table for error patterns',
        deployReady: false,
      })
    }
  } catch {
    reports.push({
      severity: 'high',
      title: 'Supabase connection failure',
      affects: 'All Sage data, memory, goals, calendar',
      rootCause: 'Database unreachable — may be paused or network issue',
      fix: 'Check Supabase dashboard — restore project if paused',
      deployReady: false,
    })
  }

  const critical = reports.filter(r => r.severity === 'critical' || r.severity === 'high')
  if (critical.length > 0) {
    await pushNotify('DEX ALERT', `${critical.length} high-severity issue(s) found.`, { tag: 'dex', urgent: true, url: '/workspace' }).catch(() => {})
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
  const [siteHealth, bugReports] = await Promise.all([
    runSiteMonitor(),
    scanForErrors(),
  ])

  const down = siteHealth.filter(s => s.status === 'down')
  const degraded = siteHealth.filter(s => s.status === 'degraded')
  const healthy = siteHealth.filter(s => s.status === 'healthy')

  return `DEX — SYSTEM STATUS
━━━━━━━━━━━━━━━━━━━━━━
SITES (${siteHealth.length} monitored):
${healthy.map(s => `✅ ${s.site}: ${s.statusCode} — ${s.responseMs}ms`).join('\n')}
${degraded.map(s => `🟡 ${s.site}: ${s.status} — ${s.error ?? ''}`).join('\n')}
${down.map(s => `🔴 ${s.site}: DOWN — ${s.error ?? ''}`).join('\n')}

INTERNAL (${bugReports.length} issue${bugReports.length !== 1 ? 's' : ''}):
${bugReports.length === 0 ? 'No internal errors detected.' : bugReports.map(r => `• [${r.severity.toUpperCase()}] ${r.title}`).join('\n')}

${down.length === 0 && degraded.length === 0 ? 'All clear. Standing by.' : `${down.length + degraded.length} site(s) need attention. Check #dex in Slack.`}`
}
