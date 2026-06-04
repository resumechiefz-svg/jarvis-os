/**
 * Jarvis Package Tier System
 * Controls feature access for Solo / Business / Enterprise customers
 *
 * Solo = $99-149/mo — core agents, 5 tool integrations, content engine
 * Business = $299-499/mo — all agents, unlimited integrations, FP&A, voice clone
 * Enterprise = $999+/mo — white-label, custom agents, dedicated support, SLA
 *
 * Note: 'internal' tier is for system use only. Never expose to customers.
 */

export type Tier = 'internal' | 'enterprise' | 'business' | 'solo' | 'free'

export interface TierFeatures {
  // Content
  contentEngine: boolean
  videoUpload: boolean           // Upload your own footage → full week
  voiceClone: boolean            // Clone your voice for all content
  carousels: boolean
  youtubeAutomation: boolean
  // Intelligence
  leadIntel: boolean
  dealIntel: boolean             // Card market / product buying signals
  businessAnalytics: boolean     // P&L, FP&A, margins
  supplyChainAlerts: boolean
  morningBrief: boolean
  // Operations
  toolIntegrations: number       // Max number of tool connections
  agentCreationByVoice: boolean  // "Build me an agent that..."
  customerServiceAgent: boolean
  teamFeatures: boolean
  // Platform
  whiteLabel: boolean
  customAgents: boolean
  dedicatedSupport: boolean
  sla: boolean
  // Limits
  postsPerMonth: number
  storageGB: number
}

export const TIER_FEATURES: Record<Tier, TierFeatures> = {
  internal: {
    // No limits. The god tier. AB's personal system.
    contentEngine: true, videoUpload: true, voiceClone: true,
    carousels: true, youtubeAutomation: true,
    leadIntel: true, dealIntel: true, businessAnalytics: true,
    supplyChainAlerts: true, morningBrief: true,
    toolIntegrations: Infinity, agentCreationByVoice: true,
    customerServiceAgent: true, teamFeatures: true,
    whiteLabel: true, customAgents: true, dedicatedSupport: true, sla: true,
    postsPerMonth: Infinity, storageGB: Infinity,
  },
  enterprise: {
    contentEngine: true, videoUpload: true, voiceClone: true,
    carousels: true, youtubeAutomation: true,
    leadIntel: true, dealIntel: true, businessAnalytics: true,
    supplyChainAlerts: true, morningBrief: true,
    toolIntegrations: Infinity, agentCreationByVoice: true,
    customerServiceAgent: true, teamFeatures: true,
    whiteLabel: true, customAgents: true, dedicatedSupport: true, sla: true,
    postsPerMonth: Infinity, storageGB: 500,
  },
  business: {
    contentEngine: true, videoUpload: true, voiceClone: true,
    carousels: true, youtubeAutomation: true,
    leadIntel: true, dealIntel: true, businessAnalytics: true,
    supplyChainAlerts: true, morningBrief: true,
    toolIntegrations: Infinity, agentCreationByVoice: true,
    customerServiceAgent: true, teamFeatures: true,
    whiteLabel: false, customAgents: false, dedicatedSupport: false, sla: false,
    postsPerMonth: Infinity, storageGB: 50,
  },
  solo: {
    contentEngine: true, videoUpload: true, voiceClone: false,
    carousels: true, youtubeAutomation: true,
    leadIntel: true, dealIntel: false, businessAnalytics: false,
    supplyChainAlerts: false, morningBrief: true,
    toolIntegrations: 5, agentCreationByVoice: false,
    customerServiceAgent: false, teamFeatures: false,
    whiteLabel: false, customAgents: false, dedicatedSupport: false, sla: false,
    postsPerMonth: 120, storageGB: 5,
  },
  free: {
    contentEngine: false, videoUpload: false, voiceClone: false,
    carousels: false, youtubeAutomation: false,
    leadIntel: false, dealIntel: false, businessAnalytics: false,
    supplyChainAlerts: false, morningBrief: false,
    toolIntegrations: 0, agentCreationByVoice: false,
    customerServiceAgent: false, teamFeatures: false,
    whiteLabel: false, customAgents: false, dedicatedSupport: false, sla: false,
    postsPerMonth: 0, storageGB: 0,
  },
}

export const TIER_PRICING: Record<Exclude<Tier, 'internal'>, { monthly: number | null; label: string; tagline: string }> = {
  free: { monthly: 0, label: 'Free', tagline: 'See what it can do' },
  solo: { monthly: 99, label: 'Solo', tagline: 'For the one-person operator' },
  business: { monthly: 299, label: 'Business', tagline: 'For operators with traction' },
  enterprise: { monthly: null, label: 'Enterprise', tagline: 'Custom — contact us' },
}

// Check if a tier has access to a feature
export function hasFeature(tier: Tier, feature: keyof TierFeatures): boolean {
  const features = TIER_FEATURES[tier]
  const value = features[feature]
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  return false
}

// Get the tier from a Supabase profile (future: pull from customer's subscription)
export function getTierFromProfile(profile?: { plan?: string } | null): Tier {
  if (!profile?.plan) return 'solo' // AB's system defaults to solo for internal use
  const plan = profile.plan.toLowerCase()
  if (plan === 'internal') return 'internal'
  if (plan === 'enterprise') return 'enterprise'
  if (plan === 'business' || plan === 'pro_plus') return 'business'
  if (plan === 'solo' || plan === 'pro') return 'solo'
  return 'free'
}
