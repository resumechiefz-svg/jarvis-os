import Stripe from 'stripe'
import { supabaseAdmin } from '../supabase/client'
import type { NovaStats } from '../types'

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  return new Stripe(key)
}

export async function getNovaStats(): Promise<NovaStats> {
  const stripe = getStripe()
  if (!stripe) return { mrr: 0, mrrChange: 0, newSubs: 0, churn: 0, trialConversions: 0, activeUsers: 0, resumesGenerated: 0, visitors: 0 }

  const now = Math.floor(Date.now() / 1000)
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60
  const sixtyDaysAgo = now - 60 * 24 * 60 * 60

  try {
    // Active subscriptions (recurring model)
    const subs = await stripe.subscriptions.list({ status: 'active', limit: 100 })
    const subMrr = subs.data.reduce((sum, sub) => {
      const item = sub.items.data[0]
      if (!item?.price?.unit_amount) return sum
      const monthly = item.price.recurring?.interval === 'year'
        ? item.price.unit_amount / 12
        : item.price.unit_amount
      return sum + monthly / 100
    }, 0)

    // Payment intents — covers one-time purchases and subscription payments
    const [recentPayments, priorPayments] = await Promise.all([
      stripe.paymentIntents.list({ created: { gte: thirtyDaysAgo }, limit: 100 }),
      stripe.paymentIntents.list({ created: { gte: sixtyDaysAgo, lt: thirtyDaysAgo }, limit: 100 }),
    ])

    const recentRevenue = recentPayments.data
      .filter(p => p.status === 'succeeded')
      .reduce((s, p) => s + p.amount / 100, 0)

    const priorRevenue = priorPayments.data
      .filter(p => p.status === 'succeeded')
      .reduce((s, p) => s + p.amount / 100, 0)

    // Use whichever is higher — subscriptions or payment-based MRR
    const mrr = Math.max(subMrr, recentRevenue)
    const mrrChange = mrr - priorRevenue

    // New paying customers this period
    const newCustomers = new Set(recentPayments.data.filter(p => p.status === 'succeeded').map(p => p.customer)).size

    // Canceled subs
    const canceled = await stripe.subscriptions.list({ created: { gte: thirtyDaysAgo }, status: 'canceled', limit: 100 })

    // Supabase data
    const [profilesRes, resumesRes] = await Promise.all([
      supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('resumes').select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(thirtyDaysAgo * 1000).toISOString()),
    ])

    return {
      mrr: Math.round(mrr * 100) / 100,
      mrrChange: Math.round(mrrChange * 100) / 100,
      newSubs: Math.max(subs.data.length, newCustomers),
      churn: canceled.data.length,
      trialConversions: subs.data.filter(s => s.trial_end).length,
      activeUsers: profilesRes.count ?? 0,
      resumesGenerated: resumesRes.count ?? 0,
      visitors: 0,
    }
  } catch (err) {
    console.error('[Nova]', err)
    return { mrr: 0, mrrChange: 0, newSubs: 0, churn: 0, trialConversions: 0, activeUsers: 0, resumesGenerated: 0, visitors: 0 }
  }
}
