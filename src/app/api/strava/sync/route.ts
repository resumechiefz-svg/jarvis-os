import { NextResponse } from 'next/server'
import { syncStravaActivities } from '@/lib/agents/strava'
export async function POST() { await syncStravaActivities(); return NextResponse.json({ ok: true }) }
export const GET = POST
