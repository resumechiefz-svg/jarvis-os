// Exchanges public token for access token — called after bank connected
import { NextRequest, NextResponse } from 'next/server'
import { plaid, saveAccessToken } from '@/lib/plaid/client'

export async function POST(req: NextRequest) {
  const { publicToken, institutionName } = await req.json()
  const res = await plaid.itemPublicTokenExchange({ public_token: publicToken })
  await saveAccessToken(res.data.access_token, institutionName ?? 'My Bank')
  return NextResponse.json({ ok: true })
}
