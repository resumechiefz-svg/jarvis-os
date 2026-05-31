/**
 * AB's Living Profile — grows with every conversation
 * Jarvis learns preferences, patterns, goals progress, and context
 * Both mobile and desktop contribute to and read from this profile
 */
import Anthropic from '@anthropic-ai/sdk'
import { saveMemory } from './vectors'
import { supabaseAdmin } from '../supabase/client'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface ABProfile {
  preferences: string[]
  patterns: string[]
  currentFocus: string[]
  recentWins: string[]
  activeGoals: string[]
  communicationStyle: string
  lastUpdated: string
}

// ── Load current profile ──────────────────────────────────
export async function loadProfile(): Promise<ABProfile | null> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('context')
    .eq('category', 'ab_profile')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!data?.context) return null
  try { return JSON.parse(data.context) } catch { return null }
}

// ── Update profile from recent conversations ──────────────
export async function updateProfile(): Promise<ABProfile> {
  // Pull last 20 conversations
  const { data: convos } = await supabaseAdmin
    .from('ai_memories')
    .select('content, context, created_at')
    .eq('category', 'conversation_summary')
    .order('created_at', { ascending: false })
    .limit(20)

  const existing = await loadProfile()

  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `Analyze these recent conversations with AB and extract a living profile.

Existing profile: ${existing ? JSON.stringify(existing) : 'None yet'}

Recent conversations:
${(convos ?? []).map(c => `AB: ${c.content}\nJarvis: ${c.context ?? ''}`).join('\n\n')}

Extract and update:
- preferences: things AB clearly likes/prefers (communication style, topics, formats)
- patterns: behavioral patterns (when active, how he works, decision style)
- currentFocus: what's top of mind right now across businesses
- recentWins: positive outcomes mentioned
- activeGoals: goals explicitly mentioned or implied
- communicationStyle: how he prefers Jarvis to respond

Return ONLY valid JSON matching this structure:
{
  "preferences": ["..."],
  "patterns": ["..."],
  "currentFocus": ["..."],
  "recentWins": ["..."],
  "activeGoals": ["..."],
  "communicationStyle": "...",
  "lastUpdated": "${new Date().toISOString()}"
}`,
    }],
  })

  let profile: ABProfile
  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const match = text.match(/\{[\s\S]*\}/)
    profile = match ? JSON.parse(match[0]) : (existing ?? getDefaultProfile())
  } catch {
    profile = existing ?? getDefaultProfile()
  }

  // Save updated profile
  await supabaseAdmin.from('ai_memories').upsert({
    category: 'ab_profile',
    content: 'AB Living Profile',
    context: JSON.stringify(profile),
    importance: 10,
    created_at: new Date().toISOString(),
  })

  // Also save as searchable memory
  await saveMemory({
    category: 'ab_profile',
    content: `AB profile: ${profile.communicationStyle}. Focus: ${profile.currentFocus.join(', ')}`,
    context: JSON.stringify(profile),
    importance: 10,
  })

  return profile
}

// ── "Remember this" — explicit memory pinning ─────────────
export async function rememberThis(content: string, category = 'pinned'): Promise<void> {
  await saveMemory({
    category,
    content,
    importance: 10,
  })
}

// ── Check if message is a "remember" command ─────────────
export function isRememberIntent(msg: string): boolean {
  const l = msg.toLowerCase()
  return l.startsWith('remember ') || l.startsWith('remember:') ||
    l.includes('remember that') || l.includes('make a note') ||
    l.includes('don\'t forget') || l.includes('keep in mind')
}

function getDefaultProfile(): ABProfile {
  return {
    preferences: ['direct responses', 'no fluff', 'data over opinions'],
    patterns: ['active entrepreneur', 'multi-business operator'],
    currentFocus: ['ResumeChiefz growth', 'Card Chiefz sales', 'TradePilot live trading'],
    recentWins: [],
    activeGoals: ['7-figure portfolio', 'financial independence by 40', 'Whitewater 50 Mile October 2026'],
    communicationStyle: 'Direct, concise, business-partner tone. Uses "sir" or "AB".',
    lastUpdated: new Date().toISOString(),
  }
}
