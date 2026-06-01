import { NextResponse } from 'next/server'
import { backupMemoryToDrive } from '@/lib/agents/memory-backup'
export async function POST() {
  const url = await backupMemoryToDrive()
  return NextResponse.json({ ok: true, url })
}
export const GET = POST
