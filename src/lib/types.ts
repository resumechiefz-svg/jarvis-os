export type AgentName = 'jarvis' | 'nova' | 'sage' | 'vault' | 'echo' | 'scout' | 'reel' | 'lister' | 'dex' | 'beacon' | 'ledger' | 'atlas'

export type AgentStatus = 'active' | 'working' | 'idle' | 'standby'

export interface Agent {
  name: AgentName
  displayName: string
  status: AgentStatus
  lastActivity?: string
  color: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  agent: AgentName
  content: string
  timestamp: Date
  card?: 'weather' | 'news'
}

export interface TelemetryEntry {
  id: string
  timestamp: Date
  agent: AgentName
  action: string
  detail?: string
}

export interface StockQuote {
  symbol: string
  price: number
  change: number
  changePercent: number
}

export interface NewsItem {
  id: string
  headline: string
  source: string
  url: string
  publishedAt: string
}

export interface NovaStats {
  mrr: number
  mrrChange: number
  newSubs: number
  churn: number
  trialConversions: number
  activeUsers: number
  resumesGenerated: number
  visitors: number
}

export interface VaultStats {
  weeklyRevenue: number
  monthlySales: number
  feedbackScore: number
  totalSales: number
  recentSales: Array<{ item: string; price: number; date: string }>
}

export interface SageBrief {
  greeting: string
  beckettWeek: boolean
  nextCustodyDate: string
  topPriorities: string[]
  bills: Array<{ name: string; amount: number; dueDate: string; overdue: boolean }>
  lifeMode: string
  recommendation: string
}

export interface JarvisResponse {
  agent: AgentName
  message: string
  card?: 'weather' | 'news'
  data?: Record<string, unknown>
  actions?: Array<{ label: string; action: string }>
}

export interface Memory {
  id: string
  category: string
  content: string
  context?: string
  importance: number
  created_at: string
}
