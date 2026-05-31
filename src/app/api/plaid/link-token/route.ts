// Creates a Plaid Link token — opens the bank connection dialog
import { NextResponse } from 'next/server'
import { plaid } from '@/lib/plaid/client'

export async function POST() {
  const res = await plaid.linkTokenCreate({
    user: { client_user_id: 'ab-jarvis-user' },
    client_name: 'Jarvis OS',
    products: ['transactions' as never],
    country_codes: ['US' as never],
    language: 'en',
  })
  return NextResponse.json({ linkToken: res.data.link_token })
}
