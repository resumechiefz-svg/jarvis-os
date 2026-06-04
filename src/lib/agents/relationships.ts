/**
 * Relationship Memory Agent
 * Remembers everyone you meet — builds genuine human connection intelligence
 *
 * "You're meeting Joe Schmoe at 2pm. Last time you discussed the Chicago deal.
 *  His son Johnny had a basketball game last week — ask how it went."
 *
 * Not replacing connection. Enabling it.
 * Helps people be more present, more genuine, more human with each other.
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface Contact {
  id: string
  name: string
  relationship: string          // colleague, client, investor, friend, family
  company?: string
  role?: string
  lastMet?: string
  meetingContext?: string
  personalDetails: PersonalDetail[]
  businessDetails: BusinessDetail[]
  conversationHistory: Meeting[]
  followUps: FollowUp[]
  tags: string[]
}

interface PersonalDetail {
  detail: string                // "Son named Johnny, plays basketball"
  learnedAt: string
  source: string                // "mentioned in meeting" | "LinkedIn" | "mutual contact"
}

interface BusinessDetail {
  detail: string
  learnedAt: string
}

interface Meeting {
  date: string
  context: string
  topicsDiscussed: string[]
  commitmentsMade: string[]
  theirMood: string
  followUpNeeded: string[]
}

interface FollowUp {
  action: string
  dueBy: string
  completed: boolean
  completedAt?: string
}

// ── Log a new contact or update existing ─────────────────────────────────────
export async function logContact(
  userId: string,
  name: string,
  details: Partial<Contact>
): Promise<void> {
  const existing = await getContact(userId, name)
  const contact: Contact = {
    id: existing?.id ?? `contact_${Date.now()}`,
    name,
    relationship: details.relationship ?? 'professional',
    ...existing,
    ...details,
    personalDetails: [...(existing?.personalDetails ?? []), ...(details.personalDetails ?? [])],
    businessDetails: [...(existing?.businessDetails ?? []), ...(details.businessDetails ?? [])],
    conversationHistory: [...(existing?.conversationHistory ?? []), ...(details.conversationHistory ?? [])],
    followUps: [...(existing?.followUps ?? []), ...(details.followUps ?? [])],
    tags: [...new Set([...(existing?.tags ?? []), ...(details.tags ?? [])])],
  }

  await supabaseAdmin.from('ai_memories').upsert({
    category: `contact_${userId}`,
    content: name.toLowerCase(),
    context: JSON.stringify(contact),
    importance: 7,
    created_at: new Date().toISOString(),
  }, { onConflict: 'content' })
}

// ── Retrieve a contact ────────────────────────────────────────────────────────
export async function getContact(userId: string, name: string): Promise<Contact | null> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('context')
    .eq('category', `contact_${userId}`)
    .ilike('content', `%${name.toLowerCase()}%`)
    .limit(1)

  if (!data?.[0]) return null
  try { return JSON.parse(data[0].context) as Contact } catch { return null }
}

// ── Pre-meeting brief — given before any interaction ─────────────────────────
export async function getMeetingBrief(userId: string, name: string): Promise<string> {
  const contact = await getContact(userId, name)
  if (!contact) {
    return `No prior history with ${name}. This is a fresh connection — good opportunity to listen more than talk.`
  }

  const lastMeeting = contact.conversationHistory.at(-1)
  const pendingFollowUps = contact.followUps.filter(f => !f.completed)
  const personalHighlights = contact.personalDetails.slice(0, 3).map(d => d.detail).join(', ')

  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Write a brief, natural pre-meeting note about this contact. Sound like a trusted advisor giving a quick heads-up before a meeting.

Contact: ${name}
Role: ${contact.role ?? 'unknown'} at ${contact.company ?? 'unknown'}
Last met: ${lastMeeting?.date ?? 'not recorded'} — ${lastMeeting?.context ?? ''}
Topics last time: ${lastMeeting?.topicsDiscussed.join(', ') ?? 'not recorded'}
Personal details to reference: ${personalHighlights || 'none on file'}
Pending follow-ups: ${pendingFollowUps.map(f => f.action).join(', ') || 'none'}

Write 2-3 sentences MAX. Conversational. Specific. Actionable.
Example: "Joe's son Johnny was playing in a tournament last time you spoke — ask how it went. He mentioned a Chicago expansion deal he was nervous about. You committed to sending him the market analysis."

Return ONLY the brief, nothing else.`,
    }],
  })

  return msg.content[0].type === 'text' ? msg.content[0].text.trim() : `Meeting with ${name}. Check your previous notes.`
}

// ── Extract contact details from a conversation ───────────────────────────────
export async function extractFromConversation(
  userId: string,
  conversation: string,
  contactName: string
): Promise<void> {
  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `Extract relationship intelligence from this conversation about/with ${contactName}.

Conversation:
${conversation.slice(0, 2000)}

Extract and return JSON:
{
  "personalDetails": ["any personal facts mentioned — family, hobbies, life events"],
  "businessDetails": ["business context, deals, challenges mentioned"],
  "topicsDiscussed": ["main topics"],
  "commitmentsMade": ["any promises or follow-ups committed to"],
  "followUps": ["things to follow up on"],
  "mood": "how they seemed (optional)"
}

Only include what's actually in the conversation. Return empty arrays if nothing found.`,
    }],
  })

  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const start = text.indexOf('{'); const end = text.lastIndexOf('}')
    const extracted = JSON.parse(text.slice(start, end + 1))

    await logContact(userId, contactName, {
      personalDetails: (extracted.personalDetails ?? []).map((d: string) => ({
        detail: d, learnedAt: new Date().toISOString(), source: 'conversation',
      })),
      businessDetails: (extracted.businessDetails ?? []).map((d: string) => ({
        detail: d, learnedAt: new Date().toISOString(),
      })),
      conversationHistory: [{
        date: new Date().toISOString(),
        context: 'recorded conversation',
        topicsDiscussed: extracted.topicsDiscussed ?? [],
        commitmentsMade: extracted.commitmentsMade ?? [],
        theirMood: extracted.mood ?? '',
        followUpNeeded: extracted.followUps ?? [],
      }],
      followUps: (extracted.followUps ?? []).map((a: string) => ({
        action: a,
        dueBy: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        completed: false,
      })),
    })
  } catch { /* silent — don't break on parse failure */ }
}
