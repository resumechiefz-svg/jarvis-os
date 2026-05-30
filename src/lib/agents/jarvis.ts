import Anthropic from '@anthropic-ai/sdk'
import { JARVIS_SYSTEM, NOVA_SYSTEM, SAGE_SYSTEM, VAULT_SYSTEM } from './prompts'
import { supabaseAdmin } from '../supabase/client'
import type { AgentName, JarvisResponse, Memory } from '../types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function getMemories(): Promise<Memory[]> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('*')
    .order('importance', { ascending: false })
    .limit(20)
  return data ?? []
}

async function saveMemory(content: string, category: string, context?: string): Promise<void> {
  await supabaseAdmin.from('ai_memories').insert({
    category,
    content,
    context,
    importance: 5,
    created_at: new Date().toISOString(),
  })
}

function detectRoute(message: string): AgentName {
  const lower = message.toLowerCase()
  if (lower.includes('stripe') || lower.includes('mrr') || lower.includes('resumechiefz') || lower.includes('subscriber') || lower.includes('nova') || lower.includes('rc metric') || lower.includes('conversion')) return 'nova'
  if (lower.includes('beckett') || lower.includes('custody') || lower.includes('grocery') || lower.includes('charlotte') || lower.includes('bill') || lower.includes('sage') || lower.includes('schedule') || lower.includes('morning')) return 'sage'
  if (lower.includes('ebay') || lower.includes('card chiefz') || lower.includes('vault') || lower.includes('listing') || lower.includes('card sale')) return 'vault'
  return 'jarvis'
}

async function callAgent(agent: AgentName, userMessage: string, systemPrompt: string, context: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt + '\n\n' + context,
    messages: [{ role: 'user', content: userMessage }],
  })
  return response.content[0].type === 'text' ? response.content[0].text : ''
}

export async function chat(userMessage: string, history: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<JarvisResponse> {
  const memories = await getMemories()
  const memoryContext = memories.length > 0
    ? `\n\nPermanent memory:\n${memories.map(m => `[${m.category}] ${m.content}`).join('\n')}`
    : ''

  const route = detectRoute(userMessage)

  if (route === 'nova') {
    const result = await callAgent('nova', userMessage, NOVA_SYSTEM, memoryContext)
    return { agent: 'nova', message: result }
  }

  if (route === 'sage') {
    const result = await callAgent('sage', userMessage, SAGE_SYSTEM, memoryContext)
    return { agent: 'sage', message: result }
  }

  if (route === 'vault') {
    const result = await callAgent('vault', userMessage, VAULT_SYSTEM, memoryContext)
    return { agent: 'vault', message: result }
  }

  // Jarvis handles it directly
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...history.slice(-6),
    { role: 'user', content: userMessage },
  ]

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: JARVIS_SYSTEM + memoryContext,
    messages,
  })

  const reply = response.content[0].type === 'text' ? response.content[0].text : ''

  // Auto-save anything that sounds like a decision or key fact
  if (userMessage.length > 50 && !userMessage.startsWith('Hey Jarvis')) {
    await saveMemory(userMessage, 'conversation', reply.slice(0, 200)).catch(() => {})
  }

  return { agent: 'jarvis', message: reply }
}

export async function morningBrief(): Promise<JarvisResponse> {
  const memories = await getMemories()
  const memCtx = memories.map(m => `[${m.category}] ${m.content}`).join('\n')

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const prompt = `Give AB his morning brief for ${today}. Format exactly:
1. Business metrics (note if RC/CC data not yet connected, give framework)
2. Personal (Beckett, bills, calendar)
3. Top 3 priorities for today
4. One strategic recommendation
5. Agent assignments for today

Be crisp. Lead with what matters. No fluff.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: JARVIS_SYSTEM + (memCtx ? `\n\nMemory:\n${memCtx}` : ''),
    messages: [{ role: 'user', content: prompt }],
  })

  const reply = response.content[0].type === 'text' ? response.content[0].text : ''
  return { agent: 'jarvis', message: reply }
}
