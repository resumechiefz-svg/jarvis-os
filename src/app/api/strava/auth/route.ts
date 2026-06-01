import { NextResponse } from 'next/server'
import { getStravaAuthUrl } from '@/lib/agents/strava'
export async function GET() { return NextResponse.redirect(getStravaAuthUrl()) }
