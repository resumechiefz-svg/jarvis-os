import { NextRequest, NextResponse } from 'next/server'
import { checkRelationshipFollowUps, addContact } from '@/lib/agents/relationship-tracker'
export async function GET() { await checkRelationshipFollowUps(); return NextResponse.json({ ok: true }) }
export async function POST(req: NextRequest) { const contact = await req.json(); await addContact(contact); return NextResponse.json({ ok: true }) }
