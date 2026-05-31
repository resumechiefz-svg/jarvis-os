import { NextResponse } from 'next/server'
import { loadProfile, updateProfile } from '@/lib/memory/profile'

export async function GET() {
  const profile = await loadProfile()
  return NextResponse.json(profile ?? { message: 'No profile yet' })
}

export async function POST() {
  const profile = await updateProfile()
  return NextResponse.json({ ok: true, profile })
}
