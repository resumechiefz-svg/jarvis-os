import { NextResponse } from 'next/server'
import { calculateGoalVelocity } from '@/lib/agents/goal-velocity'
export async function POST() { const r = await calculateGoalVelocity(); return NextResponse.json({ ok: true, ...r }) }
export const GET = POST
