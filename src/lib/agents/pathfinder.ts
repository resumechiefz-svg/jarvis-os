/**
 * Pathfinder — Life & Career Path Planning Agent
 *
 * Any goal. Any industry. Any starting point.
 * Walks you through the complete path: certifications, licenses, LLC,
 * insurance, first clients, career steps — whatever it takes.
 *
 * Examples:
 * - Electrician wanting to start a business
 * - Career changer going from finance to UX design
 * - Single parent wanting to become a real estate agent
 * - Tradesperson wanting to get certified and bid on commercial jobs
 * - Anyone who wants to break out of the 9-to-5
 *
 * COMPLIANCE RULE:
 * All guidance is informational only. Jarvis recommends consulting licensed
 * professionals (lawyers, accountants, industry boards) for legal/financial
 * decisions. Every path includes appropriate disclaimers.
 *
 * NOT telling people what to do. Laying out the path.
 * Their choice to walk it or not.
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'
import { research } from '../research'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface PathStep {
  order: number
  category: 'education' | 'certification' | 'legal' | 'financial' | 'network' | 'launch' | 'growth'
  title: string
  description: string
  estimatedTimeframe: string
  estimatedCost: string
  resources: string[]
  isRequired: boolean          // required vs recommended
  disclaimer?: string          // when professional consultation is needed
}

export interface CareerPath {
  goal: string
  industry: string
  currentSituation: string
  totalTimeEstimate: string
  totalCostEstimate: string
  steps: PathStep[]
  quickWins: string[]          // things they can do TODAY
  keyWarnings: string[]        // pitfalls, legal requirements not to skip
  complianceNote: string       // always present
  generatedAt: string
}

// ── Generate a complete path for any goal ────────────────────────────────────
export async function generatePath(
  goal: string,
  currentSituation: string,
  location: string = 'United States'
): Promise<CareerPath> {
  // Research what's current in this industry/path
  const niche = goal.toLowerCase()
  let researchContext = ''
  try {
    const brief = await research.forBusiness(niche)
    if (brief.confidence !== 'low' && brief.findings.length > 0) {
      researchContext = `\nCurrent industry signals (verified):\n${brief.synthesizedInsight.slice(0, 300)}`
    }
  } catch { /* proceed without */ }

  const msg = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    messages: [{
      role: 'user',
      content: `You are Pathfinder, a career and life planning advisor. Be real, be honest, be specific.

GOAL: ${goal}
CURRENT SITUATION: ${currentSituation}
LOCATION: ${location}
${researchContext}

Create a complete, realistic path from where they are to where they want to be.

CRITICAL RULES:
1. Be HONEST. If they're not ready, say what they need to do first.
2. Include ALL requirements — licenses, certifications, insurance, LLC, permits. Don't skip legal steps.
3. Give realistic timeframes and costs. No sugarcoating.
4. Flag anything that requires a licensed professional (lawyer, CPA, industry board).
5. Never give specific legal or financial advice — recommend consulting professionals for those decisions.
6. Quick wins: things they can do TODAY or THIS WEEK to start moving.

Return JSON:
{
  "goal": "${goal}",
  "industry": "identified industry",
  "currentSituation": "${currentSituation}",
  "totalTimeEstimate": "realistic total time from start to operational",
  "totalCostEstimate": "realistic cost range",
  "steps": [
    {
      "order": 1,
      "category": "education|certification|legal|financial|network|launch|growth",
      "title": "Step title",
      "description": "Specific, actionable description. What exactly to do, where to go, what to get.",
      "estimatedTimeframe": "e.g. 2-4 weeks",
      "estimatedCost": "e.g. $150-300 or Free",
      "resources": ["specific resource, website, organization name"],
      "isRequired": true,
      "disclaimer": "Consult a licensed [professional type] for this step" (only when legally needed)
    }
  ],
  "quickWins": ["thing they can do today", "thing they can do this week"],
  "keyWarnings": ["critical compliance items", "common mistakes that set people back"],
  "complianceNote": "This plan is for informational purposes. Requirements vary by state/locality. Consult licensed professionals for legal, financial, and licensing decisions specific to your situation."
}

Be specific. Generic advice helps no one. If you don't know a specific requirement, say so rather than guessing.`,
    }],
  })

  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const start = text.indexOf('{'); const end = text.lastIndexOf('}')
    const path = JSON.parse(text.slice(start, end + 1)) as CareerPath
    path.generatedAt = new Date().toISOString()

    // Save to Supabase so Jarvis can track progress
    await supabaseAdmin.from('ai_memories').insert({
      category: 'career_path',
      content: goal,
      context: JSON.stringify({ path, status: 'active', currentStep: 0 }),
      importance: 8,
      created_at: new Date().toISOString(),
    })

    return path
  } catch {
    return {
      goal,
      industry: 'unknown',
      currentSituation,
      totalTimeEstimate: 'varies',
      totalCostEstimate: 'varies',
      steps: [],
      quickWins: ['Research licensing requirements in your state', 'Join a relevant industry association or community'],
      keyWarnings: ['Requirements vary significantly by location — verify local requirements'],
      complianceNote: 'This plan is for informational purposes. Requirements vary by state/locality. Consult licensed professionals for legal, financial, and licensing decisions specific to your situation.',
      generatedAt: new Date().toISOString(),
    }
  }
}

// ── Format path for display ───────────────────────────────────────────────────
export function formatPathForSlack(path: CareerPath): string {
  const stepsByCategory = path.steps.reduce((acc, step) => {
    if (!acc[step.category]) acc[step.category] = []
    acc[step.category].push(step)
    return acc
  }, {} as Record<string, PathStep[]>)

  const categoryEmoji: Record<string, string> = {
    education: '📚', certification: '🏆', legal: '⚖️',
    financial: '💰', network: '🤝', launch: '🚀', growth: '📈',
  }

  let output = `🗺️ *Your Path: ${path.goal}*\n`
  output += `⏱ ${path.totalTimeEstimate} · 💵 ${path.totalCostEstimate}\n\n`

  if (path.quickWins.length > 0) {
    output += `*Start TODAY:*\n${path.quickWins.map(w => `• ${w}`).join('\n')}\n\n`
  }

  output += `*The Full Path (${path.steps.length} steps):*\n`
  path.steps.slice(0, 8).forEach(step => {
    const req = step.isRequired ? '' : ' _(optional)_'
    output += `${step.order}. ${categoryEmoji[step.category] ?? '→'} *${step.title}*${req}\n`
    output += `   ${step.description.slice(0, 100)}...\n`
    output += `   ${step.estimatedTimeframe} · ${step.estimatedCost}\n`
  })

  if (path.keyWarnings.length > 0) {
    output += `\n⚠️ *Don't skip these:*\n${path.keyWarnings.slice(0, 3).map(w => `• ${w}`).join('\n')}\n`
  }

  output += `\n_${path.complianceNote}_`
  return output
}

// ── Track progress on a path ──────────────────────────────────────────────────
export async function updatePathProgress(
  pathGoal: string,
  completedStepOrder: number
): Promise<void> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('id, context')
    .eq('category', 'career_path')
    .ilike('content', `%${pathGoal.slice(0, 30)}%`)
    .order('created_at', { ascending: false })
    .limit(1)

  if (!data?.[0]) return

  const ctx = JSON.parse(data[0].context)
  ctx.currentStep = completedStepOrder
  ctx.completedSteps = [...(ctx.completedSteps ?? []), completedStepOrder]
  ctx.lastUpdated = new Date().toISOString()

  await supabaseAdmin
    .from('ai_memories')
    .update({ context: JSON.stringify(ctx) })
    .eq('id', data[0].id)
}
