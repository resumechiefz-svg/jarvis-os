import { NextRequest, NextResponse } from 'next/server'
import { draftEmail } from '@/lib/agents/gmail-draft'
export async function POST(req: NextRequest) { const opts = await req.json(); const draft = await draftEmail(opts); return NextResponse.json({ ok: true, ...draft }) }
