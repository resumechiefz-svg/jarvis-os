import { NextResponse } from 'next/server'
import { runChurnPrediction } from '@/lib/agents/churn-predict'
export async function POST() {
  const risks = await runChurnPrediction()
  return NextResponse.json({ ok: true, count: risks.length, risks })
}
export const GET = POST
