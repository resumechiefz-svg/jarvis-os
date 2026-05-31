import { NextResponse } from 'next/server'
import { runRCOutreach } from '@/lib/agents/rc-outreach'

export async function POST() {
  const posts = await runRCOutreach()
  return NextResponse.json({ ok: true, count: posts.length, posts })
}
