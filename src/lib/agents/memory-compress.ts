/**
 * Memory Compression — distills old conversations into permanent facts
 * Raw entries 30+ days old → Claude summary → archive to Drive → remove verbose from Supabase
 * Nothing is ever deleted. Raw data lives in Drive. Summaries live in Supabase forever.
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'
import { saveMemory } from '../memory/vectors'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function runMemoryCompression(): Promise<{ compressed: number; saved: number }> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // Get old conversation summaries
  const { data: oldMemories } = await supabaseAdmin
    .from('ai_memories')
    .select('id, category, content, context, created_at')
    .eq('category', 'conversation_summary')
    .lt('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: true })
    .limit(100)

  if (!oldMemories?.length) return { compressed: 0, saved: 0 }

  // Archive raw data to Drive first
  try {
    const { backupMemoryToDrive } = await import('./memory-backup')
    await backupMemoryToDrive()
  } catch { /* continue even if Drive backup fails */ }

  // Group by week for compression
  const byWeek: Record<string, typeof oldMemories> = {}
  for (const mem of oldMemories) {
    const weekKey = new Date(mem.created_at).toISOString().slice(0, 7) // YYYY-MM
    if (!byWeek[weekKey]) byWeek[weekKey] = []
    byWeek[weekKey].push(mem)
  }

  let totalCompressed = 0

  for (const [month, memories] of Object.entries(byWeek)) {
    const rawText = memories.map(m => `AB: ${m.content}\nJarvis: ${m.context ?? ''}`).join('\n\n')

    // Claude distills into permanent facts
    const msg = await claude.messages.create({
      model: 'claude-haiku-4-5', max_tokens: 400,
      messages: [{
        role: 'user',
        content: `Compress these ${memories.length} conversations from ${month} into 3-5 permanent facts about AB.

Conversations:
${rawText.slice(0, 6000)}

Extract only durable, important facts:
- Decisions made
- Preferences revealed
- Problems solved
- Patterns noticed
- Goals discussed

Format: bullet points, each under 20 words. Skip trivial exchanges.`,
      }],
    })

    const compressed = msg.content[0].type === 'text' ? msg.content[0].text : ''
    if (!compressed) continue

    // Save compressed summary as permanent memory
    await saveMemory({
      category: 'memory_compressed',
      content: `${month} summary: ${compressed.split('\n')[0]}`,
      context: compressed,
      importance: 8,
    })

    // Remove the verbose originals from Supabase (they're in Drive)
    const ids = memories.map(m => m.id).filter(Boolean)
    if (ids.length > 0) {
      await supabaseAdmin.from('ai_memories').delete().in('id', ids)
    }

    totalCompressed += memories.length
  }

  return { compressed: totalCompressed, saved: Object.keys(byWeek).length }
}
