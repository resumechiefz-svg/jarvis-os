import { NextResponse } from 'next/server'
import { getVaultStats } from '@/lib/agents/vault'

export async function GET() {
  try {
    const stats = await getVaultStats()
    console.log('[Vault API] eBay stats returned:', JSON.stringify(stats))
    return NextResponse.json(stats)
  } catch (err) {
    console.error('[Vault API]', err)
    return NextResponse.json({ error: 'Vault failed' }, { status: 500 })
  }
}
