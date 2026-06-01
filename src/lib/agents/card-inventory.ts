/**
 * Card Chiefz Inventory Tracker — P&L per card, category analytics
 * Tracks: acquired cost, listed price, sold price, profit margin
 * VAULT uses this for pricing intelligence
 */
import { supabaseAdmin } from '../supabase/client'

export interface CardItem {
  id?: string
  title: string
  player: string
  year: string
  set: string
  grade?: string
  acquiredCost: number
  listedPrice: number
  soldPrice?: number
  soldDate?: string
  status: 'inventory' | 'listed' | 'sold'
  ebayItemId?: string
  profit?: number
  roi?: number
}

// Add or update a card in inventory
export async function upsertCard(card: CardItem): Promise<void> {
  const profit = card.soldPrice ? card.soldPrice - card.acquiredCost - (card.soldPrice * 0.13) : undefined // ~13% eBay fees
  const roi = profit && card.acquiredCost > 0 ? ((profit / card.acquiredCost) * 100) : undefined

  await supabaseAdmin.from('ai_memories').upsert({
    category: 'card_inventory',
    content: `${card.year} ${card.set} ${card.player}${card.grade ? ` ${card.grade}` : ''}`,
    context: JSON.stringify({ ...card, profit, roi }),
    importance: card.status === 'sold' ? 8 : 6,
    created_at: new Date().toISOString(),
  })
}

// Get full inventory summary
export async function getInventorySummary(): Promise<{
  totalCards: number
  totalInvested: number
  totalRevenue: number
  totalProfit: number
  avgROI: number
  byStatus: Record<string, number>
  bestPerformers: CardItem[]
}> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('context, content')
    .eq('category', 'card_inventory')
    .order('created_at', { ascending: false })

  const cards: CardItem[] = (data ?? []).map(d => {
    try { return JSON.parse(d.context ?? '{}') as CardItem } catch { return null }
  }).filter(Boolean) as CardItem[]

  const sold = cards.filter(c => c.status === 'sold')
  const totalInvested = cards.reduce((s, c) => s + (c.acquiredCost ?? 0), 0)
  const totalRevenue = sold.reduce((s, c) => s + (c.soldPrice ?? 0), 0)
  const totalProfit = sold.reduce((s, c) => s + (c.profit ?? 0), 0)
  const avgROI = sold.length > 0 ? sold.reduce((s, c) => s + (c.roi ?? 0), 0) / sold.length : 0

  const byStatus = cards.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const bestPerformers = sold
    .sort((a, b) => (b.roi ?? 0) - (a.roi ?? 0))
    .slice(0, 5)

  return { totalCards: cards.length, totalInvested, totalRevenue, totalProfit, avgROI, byStatus, bestPerformers }
}
