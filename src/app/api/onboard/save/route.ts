/**
 * Save onboarding profile and activate agents for new user
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/client'
import { slack } from '@/lib/slack'

export async function POST(req: NextRequest) {
  try {
    const { profile, userName } = await req.json() as {
      profile: {
        name: string; businessType: string; audience: string
        challenges: string; currentTools: string[]; goals: string[]
        platforms: string[]; brandVoice: string
      }
      userName: string
    }

    // Save business profile to Supabase
    await supabaseAdmin.from('ai_memories').insert({
      category: 'business_profile',
      content: profile.name,
      context: JSON.stringify({
        ...profile,
        userName,
        onboardedAt: new Date().toISOString(),
        daysSinceOnboard: 0,
        agentsActivated: ['content', 'lead_intel', 'analytics', 'morning_brief'],
      }),
      importance: 10,
      created_at: new Date().toISOString(),
    })

    // Notify via Slack
    await slack(`🎉 *New Jarvis Setup Complete*

*User:* ${userName}
*Business:* ${profile.name}
*Type:* ${profile.businessType?.slice(0, 100)}
*Platforms:* ${profile.platforms?.join(', ')}
*Goals:* ${profile.goals?.[0]?.slice(0, 100)}

Agents activated. First content plan generating now.`, 'echo')

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
