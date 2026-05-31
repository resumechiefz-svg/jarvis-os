/**
 * Plaid — Read-only financial data
 * Balances, accounts, transactions — ZERO ability to move money
 * Sandbox mode: instant test data, no real bank needed yet
 */
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid'
import { supabaseAdmin } from '../supabase/client'

const config = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV as keyof typeof PlaidEnvironments ?? 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID!,
      'PLAID-SECRET': process.env.PLAID_SECRET!,
    },
  },
})

export const plaid = new PlaidApi(config)

// ── Token management ──────────────────────────────────────

export async function saveAccessToken(token: string, institutionName: string): Promise<void> {
  await supabaseAdmin.from('ai_memories').upsert({
    category: 'plaid_access_token',
    content: institutionName,
    context: token,
    importance: 10,
    created_at: new Date().toISOString(),
  })
}

export async function getAccessTokens(): Promise<Array<{ institution: string; token: string }>> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('content, context')
    .eq('category', 'plaid_access_token')
  return (data ?? []).map(d => ({ institution: d.content, token: d.context }))
}

export async function hasConnectedAccounts(): Promise<boolean> {
  const tokens = await getAccessTokens()
  return tokens.length > 0
}

// ── Account Data ──────────────────────────────────────────

export interface PlaidAccount {
  id: string
  name: string
  officialName?: string
  type: string
  subtype: string
  balance: number
  availableBalance?: number
  institution: string
}

export interface PlaidTransaction {
  id: string
  date: string
  name: string
  amount: number           // positive = debit, negative = credit
  category: string[]
  account: string
  pending: boolean
}

export interface FinancialSnapshot {
  totalBalance: number
  totalAvailable: number
  accounts: PlaidAccount[]
  recentTransactions: PlaidTransaction[]
  netWorth: number
  monthlySpend: number
  topCategories: Array<{ name: string; amount: number }>
  connected: boolean
}

export async function getFinancialSnapshot(): Promise<FinancialSnapshot> {
  const tokens = await getAccessTokens()

  if (tokens.length === 0) {
    return { totalBalance: 0, totalAvailable: 0, accounts: [], recentTransactions: [], netWorth: 0, monthlySpend: 0, topCategories: [], connected: false }
  }

  const allAccounts: PlaidAccount[] = []
  const allTransactions: PlaidTransaction[] = []

  for (const { institution, token } of tokens) {
    try {
      // Get balances
      const balRes = await plaid.accountsBalanceGet({ access_token: token })
      for (const acct of balRes.data.accounts) {
        allAccounts.push({
          id: acct.account_id,
          name: acct.name,
          officialName: acct.official_name ?? undefined,
          type: acct.type,
          subtype: acct.subtype ?? '',
          balance: acct.balances.current ?? 0,
          availableBalance: acct.balances.available ?? undefined,
          institution,
        })
      }

      // Get last 30 days of transactions
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const endDate = new Date().toISOString().split('T')[0]
      const txRes = await plaid.transactionsGet({
        access_token: token,
        start_date: startDate,
        end_date: endDate,
        options: { count: 100 },
      })

      for (const tx of txRes.data.transactions) {
        allTransactions.push({
          id: tx.transaction_id,
          date: tx.date,
          name: tx.name,
          amount: tx.amount,
          category: tx.category ?? [],
          account: tx.account_id,
          pending: tx.pending,
        })
      }
    } catch (err) {
      console.error(`[Plaid] Error fetching ${institution}:`, err)
    }
  }

  // Calculate totals
  const checkingAndSavings = allAccounts.filter(a => ['checking', 'savings', 'cd', 'money market'].includes(a.subtype))
  const creditCards = allAccounts.filter(a => a.type === 'credit')
  const investments = allAccounts.filter(a => a.type === 'investment' || a.type === 'brokerage')

  const liquidBalance = checkingAndSavings.reduce((s, a) => s + a.balance, 0)
  const creditDebt = creditCards.reduce((s, a) => s + a.balance, 0)
  const investmentValue = investments.reduce((s, a) => s + a.balance, 0)
  const netWorth = liquidBalance - creditDebt + investmentValue

  // Monthly spend (debit transactions, exclude transfers/payments)
  const monthlySpend = allTransactions
    .filter(t => t.amount > 0 && !t.pending && !t.category.some(c => ['Transfer', 'Payment', 'Deposit'].includes(c)))
    .reduce((s, t) => s + t.amount, 0)

  // Top spending categories
  const catMap = new Map<string, number>()
  for (const tx of allTransactions.filter(t => t.amount > 0 && !t.pending)) {
    const cat = tx.category[0] ?? 'Other'
    catMap.set(cat, (catMap.get(cat) ?? 0) + tx.amount)
  }
  const topCategories = Array.from(catMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, amount]) => ({ name, amount }))

  return {
    totalBalance: liquidBalance,
    totalAvailable: checkingAndSavings.reduce((s, a) => s + (a.availableBalance ?? a.balance), 0),
    accounts: allAccounts,
    recentTransactions: allTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 20),
    netWorth,
    monthlySpend,
    topCategories,
    connected: true,
  }
}
