import { NextRequest, NextResponse } from 'next/server'
import { sendDraft } from '@/lib/agents/gmail-draft'
export async function POST(req: NextRequest) { const { draftId } = await req.json(); await sendDraft(draftId); return NextResponse.json({ ok: true }) }
