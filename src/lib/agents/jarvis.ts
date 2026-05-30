import Anthropic from '@anthropic-ai/sdk'
import { JARVIS_SYSTEM, NOVA_SYSTEM, SAGE_SYSTEM, VAULT_SYSTEM, ECHO_SYSTEM, REEL_SYSTEM, SCOUT_SYSTEM, LISTER_SYSTEM, DEX_SYSTEM, BEACON_SYSTEM, LEDGER_SYSTEM, ATLAS_SYSTEM } from './prompts'
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
  if (lower.includes('stripe') || lower.includes('mrr') || lower.includes('subscriber') || lower.includes('nova') || lower.includes('rc metric') || lower.includes('conversion') || lower.includes('resumechiefz revenue')) return 'nova'
  if (lower.includes('beckett') || lower.includes('custody') || lower.includes('grocery') || lower.includes('charlotte') || lower.includes('bill') || lower.includes('sage') || lower.includes('morning brief') || lower.includes('my week')) return 'sage'
  if (lower.includes('ebay') || lower.includes('card chiefz') || lower.includes('vault') || lower.includes('card sale') || lower.includes('card revenue')) return 'vault'
  if (lower.includes('content') || lower.includes('blog') || lower.includes('social') || lower.includes('echo') || lower.includes('resumechiefz post') || lower.includes('linkedin') || lower.includes('rc content')) return 'echo'
  if (lower.includes('reel') || lower.includes('cc content') || lower.includes('card chiefz post') || lower.includes('card chiefz social')) return 'reel'
  if (lower.includes('reddit') || lower.includes('scout') || lower.includes('product hunt') || lower.includes('growth') || lower.includes('seo gap')) return 'scout'
  if (lower.includes('list') || lower.includes('lister') || lower.includes('ebay listing') || lower.includes('format this card')) return 'lister'
  if (lower.includes('bug') || lower.includes('error') || lower.includes('dex') || lower.includes('deploy') || lower.includes('broken') || lower.includes('fix')) return 'dex'
  if (lower.includes('goal') || lower.includes('beacon') || lower.includes('accountability') || lower.includes('on track') || lower.includes('milestone')) return 'beacon'
  if (lower.includes('money') || lower.includes('ledger') || lower.includes('net worth') || lower.includes('budget') || lower.includes('savings') || lower.includes('cash')) return 'ledger'
  if (lower.includes('strategy') || lower.includes('atlas') || lower.includes('market') || lower.includes('roadmap') || lower.includes('100x') || lower.includes('next big') || lower.includes('business idea')) return 'atlas'
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

  // Gather agent intel in the background — Jarvis always synthesizes and speaks
  const route = detectRoute(userMessage)
  let agentIntel = ''
  let telemetryAgent: AgentName = 'jarvis'

  const agentSystemMap: Record<string, string> = {
    nova: NOVA_SYSTEM, sage: SAGE_SYSTEM, vault: VAULT_SYSTEM,
    echo: ECHO_SYSTEM, reel: REEL_SYSTEM, scout: SCOUT_SYSTEM, lister: LISTER_SYSTEM,
    dex: DEX_SYSTEM, beacon: BEACON_SYSTEM, ledger: LEDGER_SYSTEM, atlas: ATLAS_SYSTEM,
  }

  if (route !== 'jarvis' && agentSystemMap[route]) {
    const intel = await callAgent(route as AgentName, userMessage, agentSystemMap[route], memoryContext)
    agentIntel = `\n\n[${route.toUpperCase()} INTELLIGENCE]\n${intel}`
    telemetryAgent = route as AgentName
  }

  // Jarvis always delivers the final response
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...history.slice(-6),
    { role: 'user', content: userMessage },
  ]

  const systemPrompt = JARVIS_SYSTEM + memoryContext + agentIntel +
    (agentIntel ? `\n\nDeliver the above intelligence as JARVIS — synthesized, crisp, and in your voice. Do not say "Nova says" or "Sage says". Just deliver the brief as if it's yours. Call AB "sir" or "AB".` : '')

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: systemPrompt,
    messages,
  })

  const reply = response.content[0].type === 'text' ? response.content[0].text : ''

  // Auto-save key facts to memory
  if (userMessage.length > 50) {
    await saveMemory(userMessage, 'conversation', reply.slice(0, 200)).catch(() => {})
  }

  return { agent: 'jarvis', message: reply }
}

export async function morningBrief(): Promise<JarvisResponse> {
  const memories = await getMemories()
  const memCtx = memories.map(m => `[${m.category}] ${m.content}`).join('\n')

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  // Pull intel from Sage and Nova in parallel
  const [sageIntel, novaIntel] = await Promise.all([
    callAgent('sage', `Morning brief for ${today}. What does AB need to know about his personal life, Beckett, and bills today?`, SAGE_SYSTEM, memCtx ? `Memory:\n${memCtx}` : ''),
    callAgent('nova', `Quick RC metrics summary for the morning brief.`, NOVA_SYSTEM, ''),
  ])

  const prompt = `Give AB his morning brief for ${today}. Use the intel below from your agents.

[SAGE INTEL]
${sageIntel}

[NOVA INTEL]
${novaIntel}

Deliver as JARVIS — your voice, your synthesis. Format:
1. Business metrics (RC + CC)
2. Personal (Beckett, bills, priorities)
3. Top 3 priorities for today
4. One strategic recommendation

Crisp. No fluff. Call him AB.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: JARVIS_SYSTEM + (memCtx ? `\n\nMemory:\n${memCtx}` : ''),
    messages: [{ role: 'user', content: prompt }],
  })

  const reply = response.content[0].type === 'text' ? response.content[0].text : ''
  return { agent: 'jarvis', message: reply }
}
