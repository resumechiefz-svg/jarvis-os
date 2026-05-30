import Anthropic from '@anthropic-ai/sdk'
import { ATLAS_SYSTEM } from './prompts'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface AcquisitionMetric {
  category: string
  metric: string
  current: string
  target: string
  status: 'green' | 'yellow' | 'red'
  note: string
}

export interface AcquisitionScore {
  overallScore: number // 0-100
  readinessLevel: 'not ready' | 'building' | 'approaching' | 'ready' | 'prime'
  estimatedValuation: string
  metrics: AcquisitionMetric[]
  topGaps: string[]
  nextMilestone: string
  acquirerProfile: string
  advice: string
}

export async function getAcquisitionReadiness(mrr: number, churn: number, activeUsers: number, monthsRunning: number): Promise<AcquisitionScore> {
  const prompt = `Analyze ResumeChiefz acquisition readiness.

Current metrics:
- MRR: $${mrr}
- Monthly churn: ${churn}%
- Active users: ${activeUsers}
- Months running: ${monthsRunning}
- ARR: $${mrr * 12}
- Stack: Vercel + Supabase + Stripe + Anthropic API
- Built by: solo founder (AB, 10-year recruiter)
- Niche: AI resume builder, ATS-optimized, recruiter-built

SaaS acquisition benchmarks:
- Micro-SaaS (acquirehq, MicroAcquire): $1K-$10K MRR, 2-5x ARR multiple
- Small SaaS (strategic buyers): $10K-$50K MRR, 3-6x ARR
- Growth SaaS: $50K+ MRR, 5-10x ARR
- Churn: under 5%/mo is healthy, under 2% is excellent
- Growth rate: 15%+ MoM is attractive

Return ONLY valid JSON:
{
  "overallScore": 0-100,
  "readinessLevel": "not ready|building|approaching|ready|prime",
  "estimatedValuation": "$X-$Y range",
  "metrics": [
    {"category": "Revenue", "metric": "MRR", "current": "$${mrr}", "target": "$5,000", "status": "red|yellow|green", "note": "explanation"},
    {"category": "Revenue", "metric": "ARR", "current": "$${mrr * 12}", "target": "$60,000", "status": "red|yellow|green", "note": "explanation"},
    {"category": "Health", "metric": "Monthly Churn", "current": "${churn}%", "target": "< 5%", "status": "red|yellow|green", "note": "explanation"},
    {"category": "Growth", "metric": "Active Users", "current": "${activeUsers}", "target": "500+", "status": "red|yellow|green", "note": "explanation"},
    {"category": "Stability", "metric": "Track Record", "current": "${monthsRunning} months", "target": "12+ months", "status": "red|yellow|green", "note": "explanation"},
    {"category": "Defensibility", "metric": "Niche Authority", "current": "Recruiter-built brand", "target": "Category leader", "status": "yellow", "note": "explanation"}
  ],
  "topGaps": ["gap1", "gap2", "gap3"],
  "nextMilestone": "The single most important thing to hit next for acquisition readiness",
  "acquirerProfile": "Who would most likely buy RC and why",
  "advice": "3-4 sentences of direct advice on the path to acquisition readiness"
}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: ATLAS_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Acquisition: No JSON')
  return JSON.parse(jsonMatch[0]) as AcquisitionScore
}
