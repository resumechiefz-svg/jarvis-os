import Anthropic from '@anthropic-ai/sdk'
import { ATLAS_SYSTEM } from './prompts'
import { supabaseAdmin } from '../supabase/client'
import { pushNotify } from '../push/notify'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface BusinessIdea {
  id?: string
  title: string
  oneLiner: string
  problem: string
  solution: string
  targetAudience: string
  revenueModel: string
  estimatedMRR: string
  timeToLaunch: string
  skillsRequired: string[]
  capitalRequired: string
  competitiveEdge: string
  score: number // 1-10
  scoreRationale: string
  status: 'new' | 'reviewing' | 'approved' | 'rejected' | 'building'
  createdAt?: string
}

const IDEAS_SYSTEM = ATLAS_SYSTEM + `

IDEA SCORING RUBRIC (1-10):
- Market size: Is there real demand? (2 pts)
- AB's edge: Does his recruiting/card/SaaS background give him an unfair advantage? (2 pts)
- Speed to revenue: Can it generate $1K+/mo within 6 months? (2 pts)
- Capital efficiency: Can it be built lean, solo or near-solo? (2 pts)
- Synergy: Does it amplify ResumeChiefz or Card Chiefz? (2 pts)

Only surface ideas that score 7+. Reject anything that needs a team of 5 or $100K to start.`

export async function generateIdeas(context?: string): Promise<BusinessIdea[]> {
  const prompt = `Generate 5 high-scoring business ideas for AB right now.

AB's unfair advantages:
- 10 years recruiting experience (knows hiring inside out)
- Built ResumeChiefz (AI SaaS, knows the stack)
- Runs Card Chiefz (eBay marketplace expertise)
- Understands content creation and social media
- Charlotte NC base, single father, values time efficiency
- Budget: bootstrap only, no VC

${context ? `Additional context: ${context}` : ''}

For each idea, score it 1-10 using the rubric and only return ideas scoring 7+.

Return ONLY valid JSON array:
[
  {
    "title": "App/business name",
    "oneLiner": "One sentence description",
    "problem": "What problem does it solve",
    "solution": "How it solves it",
    "targetAudience": "Who pays for this",
    "revenueModel": "How it makes money",
    "estimatedMRR": "$X/month at maturity",
    "timeToLaunch": "X weeks/months to first dollar",
    "skillsRequired": ["skill1", "skill2"],
    "capitalRequired": "$X to start",
    "competitiveEdge": "Why AB wins here",
    "score": 8,
    "scoreRationale": "Why this scored X/10",
    "status": "new"
  }
]`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    system: IDEAS_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []

  const ideas: BusinessIdea[] = JSON.parse(jsonMatch[0])

  // Save to Supabase
  for (const idea of ideas) {
    await supabaseAdmin.from('business_ideas').insert({
      title: idea.title,
      one_liner: idea.oneLiner,
      problem: idea.problem,
      solution: idea.solution,
      target_audience: idea.targetAudience,
      revenue_model: idea.revenueModel,
      estimated_mrr: idea.estimatedMRR,
      time_to_launch: idea.timeToLaunch,
      skills_required: idea.skillsRequired,
      capital_required: idea.capitalRequired,
      competitive_edge: idea.competitiveEdge,
      score: idea.score,
      score_rationale: idea.scoreRationale,
      status: 'new',
      created_at: new Date().toISOString(),
    })
  }

  // Push notification for high scorers
  const topIdeas = ideas.filter(i => i.score >= 9)
  if (topIdeas.length > 0) {
    await pushNotify(
      '💡 ATLAS — Hot Idea',
      `${topIdeas[0].title} scored ${topIdeas[0].score}/10. Worth a look.`,
      { tag: 'ideas', url: '/ideas' }
    ).catch(() => {})
  }

  return ideas
}

export async function getIdeas(status?: string): Promise<BusinessIdea[]> {
  const query = supabaseAdmin
    .from('business_ideas')
    .select('*')
    .order('score', { ascending: false })

  if (status) query.eq('status', status)

  const { data } = await query.limit(20)
  return (data ?? []).map(d => ({
    id: d.id,
    title: d.title,
    oneLiner: d.one_liner,
    problem: d.problem,
    solution: d.solution,
    targetAudience: d.target_audience,
    revenueModel: d.revenue_model,
    estimatedMRR: d.estimated_mrr,
    timeToLaunch: d.time_to_launch,
    skillsRequired: d.skills_required ?? [],
    capitalRequired: d.capital_required,
    competitiveEdge: d.competitive_edge,
    score: d.score,
    scoreRationale: d.score_rationale,
    status: d.status,
    createdAt: d.created_at,
  }))
}

export async function updateIdeaStatus(id: string, status: BusinessIdea['status']): Promise<void> {
  await supabaseAdmin.from('business_ideas').update({ status }).eq('id', id)
}
