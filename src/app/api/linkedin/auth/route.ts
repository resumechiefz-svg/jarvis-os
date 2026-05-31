import { NextResponse } from 'next/server'
import { getLinkedInAuthUrl } from '@/lib/agents/linkedin'
export async function GET() {
  return NextResponse.redirect(getLinkedInAuthUrl())
}
