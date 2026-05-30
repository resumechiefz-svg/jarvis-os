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
    // MRR from active subscriptions
    const subs = await stripe.subscriptions.list({ status: 'active', limit: 100 })
    const mrr = subs.data.reduce((sum, sub) => {
      const item = sub.items.data[0]
      if (!item?.price?.unit_amount) return sum
      const monthly = item.price.recurring?.interval === 'year'
        ? item.price.unit_amount / 12
        : item.price.unit_amount
      return sum + monthly / 100
    }, 0)

    // New subs last 30 days
    const newSubsThisPeriod = await stripe.subscriptions.list({
      created: { gte: thirtyDaysAgo },
      status: 'active',
      limit: 100,
    })
    const newSubsPriorPeriod = await stripe.subscriptions.list({
      created: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
      status: 'active',
      limit: 100,
    })

    // Canceled subs (churn)
    const canceled = await stripe.subscriptions.list({
      created: { gte: thirtyDaysAgo },
      status: 'canceled',
      limit: 100,
    })

    // Supabase: active users and resumes
    const [profilesRes, resumesRes] = await Promise.all([
      supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('resumes').select('id', { count: 'exact', head: true }).gte('created_at', new Date(thirtyDaysAgo * 1000).toISOString()),
    ])

    const mrrChange = mrr - (mrr * newSubsPriorPeriod.data.length / Math.max(newSubsThisPeriod.data.length, 1))

    return {
      mrr: Math.round(mrr * 100) / 100,
      mrrChange: Math.round(mrrChange * 100) / 100,
      newSubs: newSubsThisPeriod.data.length,
      churn: canceled.data.length,
      trialConversions: newSubsThisPeriod.data.filter(s => s.trial_end).length,
      activeUsers: profilesRes.count ?? 0,
      resumesGenerated: resumesRes.count ?? 0,
      visitors: 0, // Requires analytics integration (Vercel Analytics / GA)
    }
  } catch {
    return {
      mrr: 0, mrrChange: 0, newSubs: 0, churn: 0,
      trialConversions: 0, activeUsers: 0, resumesGenerated: 0, visitors: 0,
    }
  }
}
