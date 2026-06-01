import { NextResponse } from 'next/server'
import { getPredictiveSuggestions } from '@/lib/agents/predictive'
export async function GET() {
  const suggestions = await getPredictiveSuggestions()
  return NextResponse.json({ suggestions })
}
