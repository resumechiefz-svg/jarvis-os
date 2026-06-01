import { slack } from '../slack'
/**
 * Relationship Tracker — key people in AB's orbit
 * Tracks: last contact, context, open items, follow-up needed
 * Jarvis surfaces when someone goes too long without contact
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'
import { saveMemory } from '../memory/vectors'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const TOKEN = process.env.SLACK_BOT_TOKEN


export interface Contact {
  name: string
  relationship: string  // 'business_partner' | 'client' | 'friend' | 'mentor' | 'investor'
  company?: string
  lastContact?: string  // ISO date
  notes?: string        // What was last discussed
  openItems?: string[]  // Things pending
  followUpDays?: number // How often to prompt (default 30)
  importance: 'high' | 'medium' | 'low'
}

// Detect if a conversation mentions a person and log contact
export async function detectContactMention(userMessage: string, assistantReply: string): Promise<void> {
  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `Does this conversation mention a specific person AB is working with or should follow up with?

User: "${userMessage}"
Jarvis: "${assistantReply}"

If yes: {"hasPerson": true, "name": "...", "context": "what was discussed in one sentence", "openItem": "any pending action or follow-up if mentioned"}
If no: {"hasPerson": false}

Return JSON only.`,
    }],
  })

  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const match = text.match(/\{[\s\S]*\}/)
    const data = match ? JSON.parse(match[0]) : {}
    if (!data.hasPerson || !data.name) return

    // Update or create contact record
    const { data: existing } = await supabaseAdmin
      .from('ai_memories')
      .select('id, context')
      .eq('category', 'contact')
      .ilike('content', data.name)
      .single()

    const now = new Date().toISOString()
    if (existing) {
      const contact = JSON.parse(existing.context ?? '{}') as Contact
      contact.lastContact = now
      if (data.context) contact.notes = data.context
      if (data.openItem) contact.openItems = [...(contact.openItems ?? []), data.openItem]

      await supabaseAdmin.from('ai_memories').update({
        context: JSON.stringify(contact),
        created_at: now,
      }).eq('id', existing.id)
    } else {
      const contact: Contact = {
        name: data.name,
        relationship: 'business_partner',
        lastContact: now,
        notes: data.context,
        openItems: data.openItem ? [data.openItem] : [],
        followUpDays: 30,
        importance: 'medium',
      }
      await supabaseAdmin.from('ai_memories').insert({
        category: 'contact',
        content: data.name,
        context: JSON.stringify(contact),
        importance: 6,
        created_at: now,
      })
      await saveMemory({
        category: 'contact',
        content: `Contact: ${data.name} — ${data.context}`,
        context: JSON.stringify(contact),
        importance: 6,
      })
    }
  } catch { /* skip */ }
}

// Add contact manually
export async function addContact(contact: Contact): Promise<void> {
  await supabaseAdmin.from('ai_memories').upsert({
    category: 'contact',
    content: contact.name,
    context: JSON.stringify(contact),
    importance: contact.importance === 'high' ? 9 : contact.importance === 'medium' ? 6 : 4,
    created_at: new Date().toISOString(),
  })
}

// Daily check — who needs follow-up?
export async function checkRelationshipFollowUps(): Promise<void> {
  const { data: contacts } = await supabaseAdmin
    .from('ai_memories')
    .select('content, context')
    .eq('category', 'contact')
    .order('created_at', { ascending: false })

  const overdue: Contact[] = []

  for (const c of contacts ?? []) {
    try {
      const contact = JSON.parse(c.context ?? '{}') as Contact
      if (!contact.lastContact) continue

      const daysSince = Math.floor((Date.now() - new Date(contact.lastContact).getTime()) / 86400000)
      const threshold = contact.followUpDays ?? 30

      if (daysSince >= threshold) {
        overdue.push(contact)
      }
    } catch { /* skip */ }
  }

  if (overdue.length === 0) return

  const report = overdue
    .sort((a, b) => (b.importance === 'high' ? 1 : 0) - (a.importance === 'high' ? 1 : 0))
    .slice(0, 5)
    .map(c => {
      const days = Math.floor((Date.now() - new Date(c.lastContact!).getTime()) / 86400000)
      const openItems = c.openItems?.length ? `\n   Open: ${c.openItems.join(', ')}` : ''
      return `• *${c.name}* — ${days} days since last contact${openItems}`
    })
    .join('\n')

  await slack(`🤝 *Relationship Follow-Ups*\n\n${report}\n\n_These people are worth a touchpoint, AB._`)
}

// Get all contacts for Jarvis context
export async function getContactContext(name: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('context')
    .eq('category', 'contact')
    .ilike('content', `%${name}%`)
    .single()

  if (!data?.context) return ''
  try {
    const c = JSON.parse(data.context) as Contact
    const days = c.lastContact
      ? Math.floor((Date.now() - new Date(c.lastContact).getTime()) / 86400000)
      : null
    return `[${c.name}: ${c.relationship}${c.company ? ` at ${c.company}` : ''}, last contact ${days !== null ? `${days} days ago` : 'unknown'}${c.notes ? `, last discussed: ${c.notes}` : ''}${c.openItems?.length ? `, open: ${c.openItems.join(', ')}` : ''}]`
  } catch { return '' }
}
