/**
 * FORGE — Jarvis's self-improvement and self-healing engine
 *
 * What it does:
 * 1. Monitors errors, agent failures, and conversation patterns
 * 2. Reads its own source code to understand the problem
 * 3. Writes actual code fixes using Claude
 * 4. Posts proposal to Slack with full diff for AB approval
 * 5. On approval (✅ reaction) → commits, pushes, Vercel auto-deploys
 * 6. Tracks every change it's made — AB can ask "what did you fix this week?"
 *
 * This is the loop: Jarvis notices → Jarvis proposes → AB approves → Jarvis deploys
 */

import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs'
import * as path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { supabaseAdmin } from '../supabase/client'
import { slack, slackNow } from '../slack'

const execAsync = promisify(exec)
const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const REPO_ROOT = path.join(process.env.HOME ?? '/Users/anthonyb23xx', 'jarvis-os')
const SRC_DIR = path.join(REPO_ROOT, 'src')

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ForgeIssue {
  id: string
  type: 'bug' | 'improvement' | 'new_feature' | 'performance' | 'user_request'
  title: string
  description: string
  evidence: string[]      // logs, errors, conversation snippets
  affectedFiles: string[] // which files are likely involved
  priority: 'critical' | 'high' | 'medium' | 'low'
  source: 'error_log' | 'conversation' | 'agent_failure' | 'manual'
  detectedAt: string
}

export interface ForgeProposal {
  id: string
  issueId: string
  title: string
  explanation: string     // plain English: what's wrong and why this fixes it
  changes: FileChange[]
  approved: boolean
  deployed: boolean
  deployedAt?: string
  createdAt: string
}

export interface FileChange {
  filePath: string        // relative to repo root
  action: 'modify' | 'create'
  before?: string         // original content (for modify)
  after: string           // new content
  description: string     // what changed in plain English
}

// ── Issue Detection ───────────────────────────────────────────────────────────

export async function detectIssues(): Promise<ForgeIssue[]> {
  const issues: ForgeIssue[] = []

  // 1. Scan recent error logs from agents
  const { data: errors } = await supabaseAdmin
    .from('ai_memories')
    .select('content, context, created_at')
    .eq('category', 'agent_error')
    .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
    .order('created_at', { ascending: false })
    .limit(50)

  // Group errors by type to find patterns
  const errorGroups: Record<string, string[]> = {}
  for (const e of errors ?? []) {
    const key = (e.content ?? '').slice(0, 60)
    if (!errorGroups[key]) errorGroups[key] = []
    errorGroups[key].push(e.context ?? '')
  }

  // Recurring errors = real bugs
  for (const [error, occurrences] of Object.entries(errorGroups)) {
    if (occurrences.length >= 2) {
      issues.push({
        id: `issue_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'bug',
        title: `Recurring error: ${error.slice(0, 80)}`,
        description: `This error has occurred ${occurrences.length} times in the last 7 days`,
        evidence: occurrences.slice(0, 3),
        affectedFiles: [],
        priority: occurrences.length >= 5 ? 'critical' : 'high',
        source: 'error_log',
        detectedAt: new Date().toISOString(),
      })
    }
  }

  // 2. Scan conversations for patterns (things AB keeps asking that Jarvis handles poorly)
  const { data: convos } = await supabaseAdmin
    .from('ai_memories')
    .select('content')
    .eq('category', 'conversation_summary')
    .gte('created_at', new Date(Date.now() - 14 * 86400000).toISOString())
    .order('created_at', { ascending: false })
    .limit(30)

  if ((convos ?? []).length > 0) {
    const conversationContext = (convos ?? []).map(c => c.content).join('\n').slice(0, 3000)

    const msg = await claude.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Analyze these recent Jarvis OS conversations. Find patterns where:
- Jarvis gave a poor or incomplete response
- AB had to repeat himself or rephrase
- A feature was clearly missing or broken
- AB expressed frustration

Conversations:
${conversationContext}

Return JSON array (max 2 items, only real patterns):
[{"title": "...", "description": "...", "evidence": ["quote"], "priority": "high|medium|low"}]
Or [] if nothing notable.`,
      }],
    })

    try {
      const text = msg.content[0].type === 'text' ? msg.content[0].text : '[]'
      const match = text.match(/\[[\s\S]*\]/)
      const patterns = match ? JSON.parse(match[0]) : []
      for (const p of patterns) {
        issues.push({
          id: `issue_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'improvement',
          title: p.title,
          description: p.description,
          evidence: p.evidence ?? [],
          affectedFiles: [],
          priority: p.priority ?? 'medium',
          source: 'conversation',
          detectedAt: new Date().toISOString(),
        })
      }
    } catch { /* skip */ }
  }

  return issues
}

// ── Read source files for context ─────────────────────────────────────────────

function readSourceFile(relativePath: string): string {
  try {
    const fullPath = path.join(REPO_ROOT, relativePath)
    if (!fullPath.startsWith(REPO_ROOT)) return '' // security: no path traversal
    return fs.readFileSync(fullPath, 'utf-8').slice(0, 8000)
  } catch {
    return ''
  }
}

function findRelevantFiles(issue: ForgeIssue): string[] {
  // Search src/ for files that might be related to the issue
  const keywords = issue.title.toLowerCase().split(' ').filter(w => w.length > 4)
  const relevant: string[] = []

  function scan(dir: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          scan(fullPath)
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          const rel = fullPath.replace(REPO_ROOT + '/', '')
          const content = fs.readFileSync(fullPath, 'utf-8').toLowerCase()
          if (keywords.some(k => content.includes(k) || rel.toLowerCase().includes(k))) {
            relevant.push(rel)
          }
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  scan(path.join(REPO_ROOT, 'src', 'lib', 'agents'))
  scan(path.join(REPO_ROOT, 'src', 'app', 'api'))
  return relevant.slice(0, 5)
}

// ── Generate Fix ──────────────────────────────────────────────────────────────

export async function proposeFix(issue: ForgeIssue): Promise<ForgeProposal | null> {
  // Find and read relevant source files
  const relevantFiles = issue.affectedFiles.length > 0
    ? issue.affectedFiles
    : findRelevantFiles(issue)

  const fileContext = relevantFiles.map(f => {
    const content = readSourceFile(f)
    return content ? `\n\n=== ${f} ===\n${content}` : ''
  }).filter(Boolean).join('')

  const msg = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `You are FORGE — the self-improvement engine for Jarvis OS.

Issue to fix:
Title: ${issue.title}
Type: ${issue.type}
Priority: ${issue.priority}
Description: ${issue.description}
Evidence: ${issue.evidence.join(' | ')}

Current source code context:${fileContext || '\n[No specific files identified — write a new file if needed]'}

Your job: Write the actual code fix. Be specific. Make it work.

Rules:
- Only change what needs to change — minimal diff
- Keep the same code style as the existing files
- If creating a new file, follow the patterns in the existing codebase
- The fix must actually solve the stated problem
- Never break existing functionality

Return JSON:
{
  "explanation": "plain English: what was wrong, what you changed, why it works now",
  "changes": [
    {
      "filePath": "src/lib/agents/example.ts",
      "action": "modify",
      "description": "what changed in this file",
      "after": "COMPLETE new file content here"
    }
  ],
  "confidence": "high|medium|low",
  "canAutoApprove": false
}

canAutoApprove: true only for trivial fixes (typos, missing null checks). Always false for logic changes.`,
    }],
  })

  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    const data = JSON.parse(match[0])

    if (!data.changes?.length) return null

    const proposal: ForgeProposal = {
      id: `forge_${Date.now()}`,
      issueId: issue.id,
      title: issue.title,
      explanation: data.explanation,
      changes: data.changes,
      approved: data.canAutoApprove === true, // auto-approve trivial fixes only
      deployed: false,
      createdAt: new Date().toISOString(),
    }

    // Save to DB
    await supabaseAdmin.from('ai_memories').insert({
      category: 'forge_proposal',
      content: proposal.id,
      context: JSON.stringify(proposal),
      importance: issue.priority === 'critical' ? 10 : 8,
      created_at: new Date().toISOString(),
    })

    return proposal
  } catch {
    return null
  }
}

// ── Execute Fix ───────────────────────────────────────────────────────────────

export async function executeFix(proposalId: string): Promise<{ success: boolean; error?: string }> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('context')
    .eq('category', 'forge_proposal')
    .eq('content', proposalId)
    .single()

  if (!data) return { success: false, error: 'Proposal not found' }

  const proposal: ForgeProposal = JSON.parse(data.context)
  if (proposal.deployed) return { success: false, error: 'Already deployed' }

  try {
    // Write all file changes
    for (const change of proposal.changes) {
      const fullPath = path.join(REPO_ROOT, change.filePath)
      // Security: only write within the repo
      if (!fullPath.startsWith(REPO_ROOT + '/src')) {
        throw new Error(`Blocked: attempted write outside src/ — ${change.filePath}`)
      }
      fs.mkdirSync(path.dirname(fullPath), { recursive: true })
      fs.writeFileSync(fullPath, change.after, 'utf-8')
    }

    // Build to verify it compiles
    await slackNow(`⚙️ *FORGE* — Building fix: "${proposal.title}"...`)
    const { stderr } = await execAsync(`cd ${REPO_ROOT} && npm run build 2>&1`, { timeout: 120000 })

    if (stderr && stderr.includes('Type error')) {
      // Rollback: restore from git
      await execAsync(`cd ${REPO_ROOT} && git checkout -- .`)
      return { success: false, error: `Build failed: ${stderr.slice(0, 500)}` }
    }

    // Commit and push
    const fileList = proposal.changes.map(c => c.filePath).join(' ')
    await execAsync(`cd ${REPO_ROOT} && git add ${fileList}`)
    await execAsync(`cd ${REPO_ROOT} && git commit -m "FORGE: ${proposal.title.slice(0, 72)}\n\nAuto-fix by Jarvis FORGE engine\nProposal: ${proposal.id}"`)
    await execAsync(`cd ${REPO_ROOT} && git push`)

    // Mark deployed
    proposal.deployed = true
    proposal.deployedAt = new Date().toISOString()
    await supabaseAdmin.from('ai_memories').update({
      context: JSON.stringify(proposal),
    }).eq('content', proposalId)

    // Log to change history
    await supabaseAdmin.from('ai_memories').insert({
      category: 'forge_deployed',
      content: proposal.title,
      context: JSON.stringify({
        proposalId,
        title: proposal.title,
        explanation: proposal.explanation,
        filesChanged: proposal.changes.map(c => c.filePath),
        deployedAt: proposal.deployedAt,
      }),
      importance: 8,
      created_at: new Date().toISOString(),
    })

    await slackNow(`✅ *FORGE deployed:* "${proposal.title}"\n\nFiles changed: ${fileList}\nVercel is building now — live in ~2 minutes.`)
    return { success: true }

  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await slackNow(`❌ *FORGE failed:* "${proposal.title}"\n${error.slice(0, 300)}`)
    // Attempt rollback
    try { await execAsync(`cd ${REPO_ROOT} && git checkout -- .`) } catch { /* ok */ }
    return { success: false, error }
  }
}

// ── Weekly scan — what did I fix, what do I recommend ─────────────────────────

export async function runForgeScsan(): Promise<void> {
  const issues = await detectIssues()

  if (issues.length === 0) {
    await slack(`🔧 *FORGE Weekly Scan* — No issues detected. All systems healthy.`)
    return
  }

  await slackNow(`🔧 *FORGE detected ${issues.length} issue${issues.length > 1 ? 's' : ''}*`)

  for (const issue of issues.slice(0, 2)) { // max 2 proposals at once
    const proposal = await proposeFix(issue)
    if (!proposal) continue

    const fileList = proposal.changes.map(c => `• \`${c.filePath}\` — ${c.description}`).join('\n')

    await slackNow(`🛠️ *FORGE Proposal — ${proposal.title}*
Priority: ${issue.priority} | Type: ${issue.type}

*What's wrong:*
${issue.description}

*What I'd fix:*
${proposal.explanation}

*Files I'd change:*
${fileList}

React ✅ to approve and deploy, or ✋ to skip.
_Proposal ID: ${proposal.id}_`)

    // Auto-deploy critical fixes without waiting
    if (issue.priority === 'critical' && proposal.approved) {
      await executeFix(proposal.id)
    }
  }
}

// ── What did Jarvis fix? ──────────────────────────────────────────────────────

export async function getChangeLog(days = 7): Promise<string> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('content, context, created_at')
    .eq('category', 'forge_deployed')
    .gte('created_at', new Date(Date.now() - days * 86400000).toISOString())
    .order('created_at', { ascending: false })

  if (!data?.length) return `No self-improvements in the last ${days} days.`

  const changes = data.map(d => {
    try {
      const c = JSON.parse(d.context)
      const date = new Date(c.deployedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      return `• *${date}* — ${c.title}\n  ${c.explanation?.split('.')[0]}.`
    } catch { return `• ${d.content}` }
  })

  return `*FORGE changes — last ${days} days:*\n${changes.join('\n')}`
}
