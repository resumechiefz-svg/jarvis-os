// Full financial snapshot — balances, transactions, net worth
import { NextResponse } from 'next/server'
import { getFinancialSnapshot } from '@/lib/plaid/client'

export async function GET() {
  const snapshot = await getFinancialSnapshot()
  return NextResponse.json(snapshot)
}
