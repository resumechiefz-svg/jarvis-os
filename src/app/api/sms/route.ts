import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER
  const toNumber = process.env.AB_PHONE_NUMBER

  if (!accountSid || !authToken || !fromNumber || !toNumber) {
    return NextResponse.json({ error: 'Twilio not configured' }, { status: 500 })
  }

  const { message } = await req.json()
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: fromNumber,
          To: toNumber,
          Body: `[JARVIS] ${message}`,
        }),
      }
    )

    if (!res.ok) throw new Error(`Twilio error: ${res.status}`)
    const data = await res.json()
    return NextResponse.json({ ok: true, sid: data.sid })
  } catch (err) {
    console.error('[SMS API]', err)
    return NextResponse.json({ error: 'SMS failed' }, { status: 500 })
  }
}
