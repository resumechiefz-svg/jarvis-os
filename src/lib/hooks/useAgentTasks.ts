/**
 * useAgentTasks — manages the live task queue shown as progress cards
 *
 * Tasks are created when Jarvis routes to an agent and completed when
 * the stream finishes. Forge builds are tracked via the polling endpoint.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentTask, TaskStatus } from '@/components/hud/AgentTaskCard'

const AGENT_COLORS: Record<string, string> = {
  jarvis: '#00d4ff', nova: '#a855f7', sage: '#00ff88', vault: '#c9a84c',
  echo: '#ff6b35', scout: '#ff4455', reel: '#ff69b4', lister: '#fbbf24',
  dex: '#60a5fa', beacon: '#34d399', ledger: '#f87171', atlas: '#e879f9',
  forge: '#e879f9', lumen: '#f0abfc',
}

// Human-readable task descriptions per agent
const AGENT_TASK_LABELS: Record<string, string[]> = {
  nova:    ['Pulling Stripe metrics', 'Analyzing RC funnel', 'Checking subscriber data'],
  sage:    ['Reviewing your schedule', 'Checking Beckett status', 'Loading personal context'],
  vault:   ['Scanning Card Chiefz sales', 'Checking eBay performance', 'Pulling listing data'],
  echo:    ['Drafting content', 'Building social post', 'Writing copy'],
  scout:   ['Scanning growth channels', 'Checking Reddit/SEO', 'Analyzing traffic data'],
  atlas:   ['Running strategic analysis', 'Scanning opportunities', 'Building roadmap'],
  beacon:  ['Checking goals & progress', 'Running accountability check', 'Reviewing milestones'],
  ledger:  ['Reviewing financials', 'Checking savings & bills', 'Loading money snapshot'],
  dex:     ['Diagnosing system', 'Checking error logs', 'Analyzing bug report'],
  lister:  ['Formatting eBay listing', 'Pricing card', 'Building listing draft'],
  reel:    ['Writing CC content', 'Drafting card post', 'Building collector copy'],
  forge:   ['Running system scan', 'Analyzing code', 'Building fix proposal'],
  jarvis:  ['Processing your request', 'Loading context', 'Thinking...'],
}

function getTaskLabel(agent: string, message?: string): string {
  if (message) {
    const l = message.toLowerCase()
    if (agent === 'nova' && l.includes('mrr')) return 'Pulling MRR from Stripe'
    if (agent === 'vault' && l.includes('sale')) return 'Checking recent eBay sales'
    if (agent === 'sage' && l.includes('beckett')) return 'Checking Beckett schedule'
    if (agent === 'atlas' && l.includes('strategy')) return 'Running strategic analysis'
    if (agent === 'echo' && l.includes('post')) return 'Drafting social content'
    if (agent === 'beacon' && l.includes('goal')) return 'Reviewing goal progress'
    if (agent === 'ledger' && l.includes('money')) return 'Loading financial snapshot'
    if (agent === 'forge' && l.includes('fix')) return 'Scanning for issues to fix'
  }
  const labels = AGENT_TASK_LABELS[agent] ?? ['Processing request']
  return labels[Math.floor(Math.random() * labels.length)]
}

export function useAgentTasks() {
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const activeTaskIdRef = useRef<string | null>(null)

  // Create a new task when agent routing begins
  const startTask = useCallback((agent: string, userMessage?: string) => {
    if (agent === 'jarvis') return // Jarvis itself doesn't get a card — only sub-agents

    const id = `task-${Date.now()}-${agent}`
    activeTaskIdRef.current = id

    const task: AgentTask = {
      id,
      agent,
      color: AGENT_COLORS[agent] ?? '#00d4ff',
      description: getTaskLabel(agent, userMessage),
      status: 'thinking',
      startedAt: Date.now(),
    }

    setTasks(prev => {
      // Replace existing card for same agent, max 4 visible
      const filtered = prev.filter(t => t.agent !== agent).slice(0, 3)
      return [task, ...filtered]
    })
    return id
  }, [])

  // Move to "working" when first token arrives
  const setWorking = useCallback((taskId: string) => {
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, status: 'working' as TaskStatus } : t
    ))
  }, [])

  // Mark complete when stream finishes
  const completeTask = useCallback((agent: string) => {
    setTasks(prev => prev.map(t =>
      t.agent === agent && (t.status === 'thinking' || t.status === 'working')
        ? { ...t, status: 'complete' as TaskStatus, completedAt: Date.now() }
        : t
    ))
    activeTaskIdRef.current = null
  }, [])

  // Mark error
  const errorTask = useCallback((agent: string) => {
    setTasks(prev => prev.map(t =>
      t.agent === agent && t.status !== 'complete'
        ? { ...t, status: 'error' as TaskStatus, completedAt: Date.now() }
        : t
    ))
    activeTaskIdRef.current = null
  }, [])

  // Manual dismiss
  const dismissTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id))
  }, [])

  // ── Poll /api/forge for active builds ──────────────────────────────────────
  useEffect(() => {
    let alive = true

    const poll = async () => {
      try {
        const data = await fetch('/api/forge').then(r => r.json())
        if (!alive) return

        if (data.active) {
          // FORGE build is running — ensure it has a task card
          setTasks(prev => {
            const existing = prev.find(t => t.agent === 'forge' && t.status !== 'complete')
            if (existing) return prev
            return [{
              id: `forge-${data.active.id ?? Date.now()}`,
              agent: 'forge',
              color: AGENT_COLORS.forge,
              description: data.active.idea ? `Building: ${data.active.idea.slice(0, 50)}` : 'Running build...',
              status: 'working' as TaskStatus,
              startedAt: Date.now(),
            }, ...prev.filter(t => t.agent !== 'forge')]
          })
        } else {
          // No active build — complete any lingering forge tasks
          setTasks(prev => prev.map(t =>
            t.agent === 'forge' && t.status === 'working'
              ? { ...t, status: 'complete' as TaskStatus, completedAt: Date.now() }
              : t
          ))
        }
      } catch { /* silent */ }
    }

    poll()
    const interval = setInterval(poll, 10 * 1000)
    return () => { alive = false; clearInterval(interval) }
  }, [])

  return { tasks, startTask, setWorking, completeTask, errorTask, dismissTask }
}
