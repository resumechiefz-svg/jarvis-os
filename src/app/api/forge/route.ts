import { NextRequest, NextResponse } from 'next/server'
import { startBuild, getActiveBuild, getRecentBuilds } from '@/lib/agents/forge/builder'

// GET: active build status + recent builds
export async function GET() {
  const active = getActiveBuild()
  const recent = await getRecentBuilds()
  return NextResponse.json({ active, recent })
}

// POST: start a new build from an idea
export async function POST(req: NextRequest) {
  const { idea } = await req.json()
  if (!idea?.trim()) return NextResponse.json({ error: 'Describe what you want to build' }, { status: 400 })

  try {
    const job = await startBuild(idea.trim())
    return NextResponse.json({
      ok: true,
      id: job.id,
      message: `FORGE is on it. Speccing "${idea}" now — check #forge in Slack for progress.`,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Build failed'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
