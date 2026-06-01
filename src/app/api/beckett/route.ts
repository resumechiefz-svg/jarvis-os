import { NextRequest, NextResponse } from 'next/server'
import { checkBeckettAlerts, getBeckettContext, isCurrentlyCustodyWeek, daysUntilNextHandoff, daysUntilBirthday } from '@/lib/agents/beckett'
export async function GET() {
  await checkBeckettAlerts()
  return NextResponse.json({ context: await getBeckettContext(), custodyWeek: isCurrentlyCustodyWeek(), handoffDays: daysUntilNextHandoff(), birthdayDays: daysUntilBirthday() })
}
