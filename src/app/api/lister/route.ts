import { NextRequest, NextResponse } from 'next/server'
import { formatListing, bulkFormatListings } from '@/lib/agents/lister'
import { notifyListing } from '@/lib/agents/slack-notify'

export async function POST(req: NextRequest) {
  try {
    const { cards, single } = await req.json()

    if (single) {
      const listing = await formatListing(single)
      await notifyListing(listing).catch(console.error)
      return NextResponse.json({ ok: true, listing })
    }

    if (cards && Array.isArray(cards)) {
      const listings = await bulkFormatListings(cards)
      for (const listing of listings) {
        await notifyListing(listing).catch(console.error)
      }
      return NextResponse.json({ ok: true, listings })
    }

    return NextResponse.json({ error: 'Provide single card or cards array' }, { status: 400 })
  } catch (err) {
    console.error('[Lister API]', err)
    return NextResponse.json({ error: 'Lister failed' }, { status: 500 })
  }
}
