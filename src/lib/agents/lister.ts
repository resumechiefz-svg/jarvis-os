import Anthropic from '@anthropic-ai/sdk'
import { LISTER_SYSTEM } from './prompts'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface CardListing {
  title: string          // under 80 chars, eBay optimized
  description: string    // full HTML description
  suggestedPrice: number
  priceRationale: string
  category: string
}

export interface CardInput {
  player: string
  year: string
  brand: string
  set: string
  parallel?: string
  cardNumber?: string
  team?: string
  condition: string     // raw/PSA 9/BGS 9.5/etc
  grade?: string
}

export async function formatListing(card: CardInput): Promise<CardListing> {
  const prompt = `Format a complete eBay listing for this card:

${JSON.stringify(card, null, 2)}

Return ONLY valid JSON:
{
  "title": "eBay title under 80 chars — Year Brand Set Player Parallel Grade",
  "description": "full listing description as HTML — bold title, bullet list (Card/Set/Year/Parallel/Condition/Card Number/Team/Player), professional tone",
  "suggestedPrice": 0.00,
  "priceRationale": "based on recent sold comps — explain the pricing",
  "category": "Sports Trading Cards"
}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: LISTER_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Lister: No JSON')
  return JSON.parse(jsonMatch[0]) as CardListing
}

export async function bulkFormatListings(cards: CardInput[]): Promise<CardListing[]> {
  return Promise.all(cards.map(formatListing))
}

export async function getListingRecommendations(inventory: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    system: LISTER_SYSTEM,
    messages: [{
      role: 'user',
      content: `Based on this inventory, recommend the next 10 cards to list and flag any slow movers for price adjustment:\n\n${inventory}`,
    }],
  })
  return response.content[0].type === 'text' ? response.content[0].text : ''
}
