import Anthropic from '@anthropic-ai/sdk'
import { LEDGER_SYSTEM } from './prompts'
import { supabaseAdmin } from '../supabase/client'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface FinancialSnapshot {
  checkingBalance: number
  savingsBalance: number
  emergencyFund: number
  carFund: number
  netWorth: number
  upcomingBills: Array<{ name: string; amount: number; dueDate: string }>
  monthlyIncome: number
  monthlyExpenses: number
  savingsRate: number
}

export async function getFinancialSnapshot(): Promise<FinancialSnapshot> {
  try {
    const [profileRes, billsRes, transRes] = await Promise.all([
      supabaseAdmin.from('profiles').select('*').single(),
      supabaseAdmin.from('calendar_events').select('*').eq('type', 'bill').gte('date', new Date().toISOString().split('T')[0]).order('date').limit(5),
      supabaseAdmin.from('transactions').select('amount, type').gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    ])

    const profile = profileRes.data ?? {}
    const bills = billsRes.data ?? []
    const transactions = transRes.data ?? []

    const income = transactions.filter((t: { type: string }) => t.type === 'income').reduce((s: number, t: { amount: number }) => s + t.amount, 0)
    const expenses = transactions.filter((t: { type: string }) => t.type === 'expense').reduce((s: number, t: { amount: number }) => s + t.amount, 0)
    const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0

    const checking = profile.checking_balance ?? 0
    const savings = profile.savings_balance ?? 0
    const emergency = profile.emergency_fund_current ?? 0
    const car = profile.car_fund_current ?? 0

    return {
      checkingBalance: checking,
      savingsBalance: savings,
      emergencyFund: emergency,
      carFund: car,
      netWorth: checking + savings + emergency + car + (profile.retirement_balance ?? 0),
      upcomingBills: bills.map((b: { title: string; amount: number; date: string }) => ({ name: b.title, amount: b.amount ?? 0, dueDate: b.date })),
      monthlyIncome: income,
      monthlyExpenses: expenses,
      savingsRate: Math.round(savingsRate),
    }
  } catch {
    return {
      checkingBalance: 0, savingsBalance: 0, emergencyFund: 0, carFund: 0,
      netWorth: 0, upcomingBills: [], monthlyIncome: 0, monthlyExpenses: 0, savingsRate: 0,
    }
  }
}

export async function getLedgerBrief(): Promise<string> {
  const snapshot = await getFinancialSnapshot()

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: LEDGER_SYSTEM,
    messages: [{
      role: 'user',
      content: `Financial snapshot for AB:

Checking: $${snapshot.checkingBalance}
Savings: $${snapshot.savingsBalance}
Emergency Fund: $${snapshot.emergencyFund}
Car Fund: $${snapshot.carFund}
Net Worth: $${snapshot.netWorth}
Monthly Income (30d): $${snapshot.monthlyIncome}
Monthly Expenses (30d): $${snapshot.monthlyExpenses}
Savings Rate: ${snapshot.savingsRate}%
Upcoming Bills: ${snapshot.upcomingBills.map(b => `${b.name} $${b.amount} due ${b.dueDate}`).join(', ') || 'none loaded'}

Give a crisp financial brief. Lead with net worth, flag any concerns, and give one concrete move.`,
    }],
  })

  return response.content[0].type === 'text' ? response.content[0].text : ''
}
