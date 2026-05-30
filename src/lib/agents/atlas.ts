import Anthropic from '@anthropic-ai/sdk'
import { ATLAS_SYSTEM } from './prompts'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function getStrategicBrief(rcMrr: number, ccWeeklyRevenue: number): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: ATLAS_SYSTEM,
    messages: [{
      role: 'user',
      content: `Strategic brief for AB's portfolio.

Current state:
- ResumeChiefz MRR: $${rcMrr}
- Card Chiefz weekly revenue: $${ccWeeklyRevenue}
- Phase: Early SaaS + established eBay store
- Goal: 7-figure portfolio, financial independence by 40

Give me:
1. Where AB is on the 7-figure roadmap right now
2. The single biggest opportunity he's underexploiting
3. What competitors or market shifts he needs to know about
4. The next milestone to chase and exactly how to hit it

Be specific. Back everything with logic.`,
    }],
  })
  return response.content[0].type === 'text' ? response.content[0].text : ''
}

export async function getBusinessIdeas(): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    system: ATLAS_SYSTEM,
    messages: [{
      role: 'user',
      content: `AB is a 10-year recruiter in Charlotte who has built ResumeChiefz (AI resume SaaS) and Card Chiefz (eBay card store). He understands content, recruiting, eBay selling, and is learning SaaS.

What are the 3 best business ideas he could launch next that:
- Leverage his existing skills and audience
- Have real market demand
- Could generate $5K+/mo within 12 months
- Don't require a massive team

Show your reasoning for each.`,
    }],
  })
  return response.content[0].type === 'text' ? response.content[0].text : ''
}

export async function getMarketIntel(topic: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: ATLAS_SYSTEM,
    messages: [{
      role: 'user',
      content: `Market intelligence on: ${topic}\n\nHow does this affect AB's businesses and what should he do about it?`,
    }],
  })
  return response.content[0].type === 'text' ? response.content[0].text : ''
}
