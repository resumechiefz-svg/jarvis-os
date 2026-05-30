import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'

webpush.setVapidDetails(
  process.env.VAPID_EMAIL ?? 'mailto:resumeforgee@gmail.com',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '',
  process.env.VAPID_PRIVATE_KEY ?? '',
)

// In-memory subscription store (persists while server is running)
// For production, store in Supabase
let subscription: webpush.PushSubscription | null = null

export async function POST(req: NextRequest) {
  const body = await req.json()

  // Register a new push subscription
  if (body.action === 'subscribe') {
    subscription = body.subscription as webpush.PushSubscription
    return NextResponse.json({ ok: true })
  }

  // Send a push notification
  if (body.action === 'notify') {
    if (!subscription) {
      return NextResponse.json({ error: 'No subscription registered' }, { status: 400 })
    }

    try {
      await webpush.sendNotification(
        subscription,
        JSON.stringify({
          title: body.title ?? 'JARVIS',
          body: body.message,
          tag: body.tag ?? 'jarvis',
          urgent: body.urgent ?? false,
          url: body.url ?? '/',
        })
      )
      return NextResponse.json({ ok: true })
    } catch (err) {
      console.error('[Push]', err)
      return NextResponse.json({ error: 'Push failed' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

export async function GET() {
  return NextResponse.json({ subscribed: !!subscription })
}
