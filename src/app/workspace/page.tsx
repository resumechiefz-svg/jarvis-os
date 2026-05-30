'use client'

import { useState, useEffect, useRef } from 'react'

const AGENT_COLORS: Record<string, string> = {
  jarvis:  '#00d4ff',
  nova:    '#a855f7',
  sage:    '#00ff88',
  vault:   '#c9a84c',
  echo:    '#ff6b35',
  scout:   '#ff4455',
  reel:    '#ff69b4',
  lister:  '#fbbf24',
  dex:     '#60a5fa',
  beacon:  '#34d399',
  ledger:  '#f87171',
  atlas:   '#e879f9',
}

const AGENTS = [
  { id: 'echo',   name: 'ECHO',   role: 'RC Content Engine',       phase: 2, description: 'Daily blog + social content for ResumeChiefz' },
  { id: 'reel',   name: 'REEL',   role: 'CC Content Engine',       phase: 2, description: 'Daily social content for Card Chiefz' },
  { id: 'lister', name: 'LISTER', role: 'eBay Listing Automation', phase: 2, description: 'Formats and stages eBay listings for review' },
  { id: 'scout',  name: 'SCOUT',  role: 'Growth Agent',            phase: 2, description: 'Reddit monitoring, Product Hunt, SEO opportunities' },
  { id: 'nova',   name: 'NOVA',   role: 'RC Stats Intelligence',   phase: 1, description: 'ResumeChiefz financial metrics and analysis' },
  { id: 'sage',   name: 'SAGE',   role: 'Personal Life OS',        phase: 1, description: 'Daily brief, Beckett, schedule, bills' },
  { id: 'vault',  name: 'VAULT',  role: 'CC Sales Intelligence',   phase: 1, description: 'Card Chiefz eBay performance tracking' },
  { id: 'dex',    name: 'DEX',    role: 'Developer & System',      phase: 3, description: 'Bug monitoring, fix staging, deploy management' },
  { id: 'beacon', name: 'BEACON', role: 'Goals & Accountability',  phase: 3, description: 'Goal tracking, accountability, milestone alerts' },
  { id: 'ledger', name: 'LEDGER', role: 'Financial Intelligence',  phase: 3, description: 'Net worth, cash flow, bill radar, goal ETAs' },
  { id: 'atlas',  name: 'ATLAS',  role: 'Strategic Intelligence',  phase: 3, description: 'Market trends, competitive intel, 7-figure roadmap' },
]

interface AgentOutput {
  loading: boolean
  content: string
  timestamp?: Date
}

export default function Workspace() {
  const [activeTab, setActiveTab] = useState('echo')
  const [input, setInput] = useState('')
  const [outputs, setOutputs] = useState<Record<string, AgentOutput>>({})
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [outputs])

  const activeAgent = AGENTS.find(a => a.id === activeTab)
  const color = AGENT_COLORS[activeTab] ?? '#00d4ff'

  async function runAgent(agentId: string, command?: string) {
    setOutputs(prev => ({
      ...prev,
      [agentId]: { loading: true, content: prev[agentId]?.content ?? '' },
    }))

    try {
      let result = ''

      if (agentId === 'echo') {
        const res = await fetch('/api/echo')
        const data = await res.json()
        if (data.content) {
          result = formatEchoOutput(data.content)
        }
      } else if (agentId === 'reel') {
        const res = await fetch('/api/reel')
        const data = await res.json()
        if (data.content) {
          result = formatReelOutput(data.content)
        }
      } else if (agentId === 'scout') {
        const res = await fetch('/api/scout')
        const data = await res.json()
        result = data.brief ?? 'Scout: no brief returned'
      } else if (agentId === 'nova') {
        const res = await fetch('/api/nova')
        const data = await res.json()
        result = formatNovaOutput(data)
      } else if (agentId === 'sage') {
        const res = await fetch('/api/sage')
        const data = await res.json()
        result = formatSageOutput(data)
      } else if (agentId === 'vault') {
        const res = await fetch('/api/vault')
        const data = await res.json()
        result = formatVaultOutput(data)
      } else {
        // Chat with agent via Jarvis
        const res = await fetch('/api/jarvis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: command ?? `${agentId}, give me your status report.`, history: [] }),
        })
        const data = await res.json()
        result = data.message ?? 'No response.'
      }

      setOutputs(prev => ({
        ...prev,
        [agentId]: { loading: false, content: result, timestamp: new Date() },
      }))
    } catch {
      setOutputs(prev => ({
        ...prev,
        [agentId]: { loading: false, content: 'Error connecting to agent.', timestamp: new Date() },
      }))
    }
  }

  async function sendCommand() {
    if (!input.trim()) return
    const cmd = input
    setInput('')
    await runAgent(activeTab, cmd)
  }

  return (
    <div className="workspace-root">
      {/* Agent tabs */}
      <div className="workspace-tabs">
        {AGENTS.map(agent => (
          <button
            key={agent.id}
            onClick={() => setActiveTab(agent.id)}
            className={`workspace-tab ${activeTab === agent.id ? 'active' : ''}`}
            style={{
              borderBottomColor: activeTab === agent.id ? AGENT_COLORS[agent.id] : 'transparent',
              color: activeTab === agent.id ? AGENT_COLORS[agent.id] : 'rgba(255,255,255,0.3)',
            }}
          >
            <span className="tab-dot" style={{ backgroundColor: agent.phase === 1 ? AGENT_COLORS[agent.id] : agent.phase === 2 ? AGENT_COLORS[agent.id] : 'rgba(255,255,255,0.15)' }} />
            {agent.name}
            {agent.phase > 1 && <span className="tab-phase">P{agent.phase}</span>}
          </button>
        ))}

        {/* Back to HUD */}
        <a href="/" className="workspace-tab ml-auto" style={{ color: 'rgba(255,255,255,0.3)' }}>
          ← HUD
        </a>
      </div>

      {/* Agent workspace */}
      <div className="workspace-body">
        {/* Agent header */}
        <div className="workspace-header" style={{ borderBottomColor: `${color}30` }}>
          <div className="flex items-center gap-3">
            <div className="agent-avatar" style={{ borderColor: color, boxShadow: `0 0 12px ${color}40` }}>
              <span style={{ color }}>{activeAgent?.name[0]}</span>
            </div>
            <div>
              <div className="text-[16px] font-bold tracking-wider" style={{ color }}>
                {activeAgent?.name}
              </div>
              <div className="text-[11px] text-white/40">{activeAgent?.role}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {outputs[activeTab]?.timestamp && (
              <span className="text-[9px] text-white/30">
                Last run: {outputs[activeTab].timestamp?.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => runAgent(activeTab)}
              disabled={outputs[activeTab]?.loading}
              className="run-btn"
              style={{ borderColor: color, color, backgroundColor: `${color}15` }}
            >
              {outputs[activeTab]?.loading ? 'WORKING...' : '▶ RUN'}
            </button>
          </div>
        </div>

        {/* Output area */}
        <div ref={outputRef} className="workspace-output">
          {outputs[activeTab]?.loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="loading-orb" style={{ borderColor: color }} />
              <div className="text-[11px] tracking-widest" style={{ color }}>
                {activeAgent?.name} IS WORKING...
              </div>
              <div className="text-[10px] text-white/30">{activeAgent?.description}</div>
            </div>
          ) : outputs[activeTab]?.content ? (
            <pre className="workspace-pre">{outputs[activeTab].content}</pre>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <div className="text-[32px] font-bold tracking-widest" style={{ color: `${color}30` }}>
                {activeAgent?.name}
              </div>
              <div className="text-[11px] text-white/30">{activeAgent?.description}</div>
              <div className="text-[10px] text-white/20 mt-2">
                Click RUN to activate, or type a command below
              </div>
            </div>
          )}
        </div>

        {/* Command input */}
        <div className="workspace-input-row">
          <span className="text-[10px] font-mono" style={{ color: `${color}80` }}>
            {activeAgent?.name} &gt;
          </span>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendCommand()}
            placeholder={`Give ${activeAgent?.name} a command...`}
            className="workspace-input"
            style={{ caretColor: color }}
          />
          <button
            onClick={sendCommand}
            disabled={!input.trim() || outputs[activeTab]?.loading}
            className="send-btn"
            style={{ backgroundColor: `${color}20`, borderColor: `${color}40`, color }}
          >
            SEND
          </button>
        </div>
      </div>
    </div>
  )
}

// Format helpers
function formatEchoOutput(c: { theme: string; date: string; twitter: string[]; linkedin: string[]; instagram: string[]; facebook: string[]; blogIdea: string }) {
  return `ECHO — RC CONTENT BRIEF
━━━━━━━━━━━━━━━━━━━━━━
Theme: ${c.theme}
Date:  ${c.date}

TWITTER/X (3 posts)
${c.twitter.map((t, i) => `${i + 1}. ${t}`).join('\n\n')}

LINKEDIN (2 posts)
${c.linkedin.map((p, i) => `${i + 1}.\n${p}`).join('\n\n')}

INSTAGRAM (2 captions)
${c.instagram.map((p, i) => `${i + 1}.\n${p}`).join('\n\n')}

FACEBOOK (2 posts)
${c.facebook.map((p, i) => `${i + 1}.\n${p}`).join('\n\n')}

BLOG IDEA
${c.blogIdea}

→ Pushed to #echo in Slack for your approval, AB.`
}

function formatReelOutput(c: { theme: string; date: string; instagram: string[]; facebook: string[]; twitter: string[]; marketInsight: string; youtubeIdea: string }) {
  return `REEL — CC CONTENT BRIEF
━━━━━━━━━━━━━━━━━━━━━━
Theme: ${c.theme}
Date:  ${c.date}

INSTAGRAM (2 captions)
${c.instagram.map((p, i) => `${i + 1}.\n${p}`).join('\n\n')}

FACEBOOK (2 posts)
${c.facebook.map((p, i) => `${i + 1}.\n${p}`).join('\n\n')}

TWITTER/X (3 posts)
${c.twitter.map((t, i) => `${i + 1}. ${t}`).join('\n\n')}

MARKET INSIGHT
${c.marketInsight}

YOUTUBE IDEA
${c.youtubeIdea}

→ Pushed to #reel in Slack for your approval, AB.`
}

function formatNovaOutput(d: { mrr?: number; newSubs?: number; churn?: number; activeUsers?: number; resumesGenerated?: number }) {
  return `NOVA — RC METRICS
━━━━━━━━━━━━━━━━━━━━━━
MRR:              $${d.mrr ?? 0}
New Subs (30d):   ${d.newSubs ?? 0}
Churn (30d):      ${d.churn ?? 0}
Active Users:     ${d.activeUsers ?? 0}
Resumes (30d):    ${d.resumesGenerated ?? 0}`
}

function formatSageOutput(d: { greeting?: string; beckettWeek?: boolean; nextCustodyDate?: string; topPriorities?: string[]; lifeMode?: string }) {
  return `SAGE — LIFE OS BRIEF
━━━━━━━━━━━━━━━━━━━━━━
${d.greeting ?? 'Good day, AB.'}

Beckett Week:     ${d.beckettWeek ? 'YES ✓' : 'NO'}
Next Switch:      ${d.nextCustodyDate ?? '—'}
Life Mode:        ${d.lifeMode?.toUpperCase() ?? '—'}

Top Priorities:
${(d.topPriorities ?? []).map((p, i) => `${i + 1}. ${p}`).join('\n')}`
}

function formatVaultOutput(d: { weeklyRevenue?: number; monthlySales?: number; feedbackScore?: number; totalSales?: number; recentSales?: Array<{ item: string; price: number }> }) {
  return `VAULT — CC SALES BRIEF
━━━━━━━━━━━━━━━━━━━━━━
Weekly Revenue:   $${d.weeklyRevenue ?? 0}
Monthly Sales:    ${d.monthlySales ?? 0}
Feedback Score:   ${d.feedbackScore ?? 99.5}%
Total Sales:      ${d.totalSales ?? 1400}+

Recent Sales:
${(d.recentSales ?? []).map(s => `• ${s.item} — $${s.price}`).join('\n') || '— connect eBay API for live data'}`
}
