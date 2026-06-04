'use client'
/**
 * Jarvis Onboarding — conversational business setup
 * 30 minutes to full autonomous operation
 *
 * Day 1: Jarvis learns your business through conversation
 * Day 30: Starts anticipating. Runs autonomously.
 * Day 90: Knows you better than you know yourself.
 */
import { useState, useRef, useEffect, useCallback } from 'react'

const cyan = '#00d4ff'
const gold = '#c9a84c'
const green = '#00ff88'

interface Message {
  role: 'jarvis' | 'user'
  text: string
  timestamp: Date
}

interface BusinessProfile {
  name: string
  businessType: string
  industry: string
  products: string
  audience: string
  currentTools: string[]
  goals: string[]
  challenges: string
  brandVoice: string
  platforms: string[]
  revenueRange?: string
}

const ONBOARD_STEPS = [
  { id: 'intro', question: null },
  { id: 'name', question: "First — what's your name?" },
  { id: 'business_name', question: "What's your business called?" },
  { id: 'business_type', question: "Tell me what you do. Not the elevator pitch — just real talk. What is it?" },
  { id: 'audience', question: "Who are your customers? Who do you actually sell to?" },
  { id: 'challenges', question: "What's the biggest thing in your business right now that you wish was handled for you?" },
  { id: 'tools', question: "What tools are you using? Stripe, Shopify, Google Workspace, QuickBooks — what do you run on?" },
  { id: 'goals', question: "Where do you want to be in 12 months? Revenue, scale, whatever it looks like — be specific." },
  { id: 'platforms', question: "Which platforms do you want content on? Instagram, LinkedIn, YouTube, TikTok, Pinterest — pick your battles." },
  { id: 'voice', question: "How do you talk to your customers? Formal? Casual? Do you swear? Are you the expert or the peer? Give me a feel." },
  { id: 'complete', question: null },
]

export default function OnboardPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [step, setStep] = useState(0)
  const [profile, setProfile] = useState<Partial<BusinessProfile>>({})
  const [isTyping, setIsTyping] = useState(false)
  const [complete, setComplete] = useState(false)
  const [userName, setUserName] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const addJarvisMessage = useCallback((text: string) => {
    setMessages(prev => [...prev, { role: 'jarvis', text, timestamp: new Date() }])
  }, [])

  // Kick off the intro
  useEffect(() => {
    setTimeout(() => {
      addJarvisMessage("I'm Jarvis. I'm going to be running your business with you — content, leads, analytics, operations. All of it, autonomously.")
      setTimeout(() => {
        addJarvisMessage("This takes about 20 minutes. By the end, I'll have enough to start working. By day 90, I'll know your business better than most of your employees do.")
        setTimeout(() => {
          addJarvisMessage("Let's start simple.")
          setStep(1)
        }, 1200)
      }, 1000)
    }, 800)
  }, [addJarvisMessage])

  // Show next question when step changes
  useEffect(() => {
    if (step === 0 || step >= ONBOARD_STEPS.length) return
    const currentStep = ONBOARD_STEPS[step]
    if (!currentStep.question) return

    setIsTyping(true)
    setTimeout(() => {
      setIsTyping(false)
      addJarvisMessage(currentStep.question!)
      inputRef.current?.focus()
    }, 600)
  }, [step, addJarvisMessage])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    const userText = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: userText, timestamp: new Date() }])

    // Process answer
    setIsTyping(true)
    await new Promise(r => setTimeout(r, 400))
    setIsTyping(false)

    const stepId = ONBOARD_STEPS[step]?.id

    // Update profile
    const newProfile = { ...profile }
    switch (stepId) {
      case 'name':
        setUserName(userText.split(' ')[0])
        break
      case 'business_name':
        newProfile.name = userText
        break
      case 'business_type':
        newProfile.businessType = userText
        break
      case 'audience':
        newProfile.audience = userText
        break
      case 'challenges':
        newProfile.challenges = userText
        break
      case 'tools':
        newProfile.currentTools = userText.split(/,|\band\b/).map(t => t.trim()).filter(Boolean)
        break
      case 'goals':
        newProfile.goals = [userText]
        break
      case 'platforms':
        newProfile.platforms = ['Instagram', 'LinkedIn', 'YouTube', 'TikTok', 'Pinterest']
          .filter(p => userText.toLowerCase().includes(p.toLowerCase()))
        break
      case 'voice':
        newProfile.brandVoice = userText
        break
    }
    setProfile(newProfile)

    // Contextual acknowledgment before next question
    const acks: Record<string, string> = {
      name: `Good to meet you, ${userText.split(' ')[0]}.`,
      business_name: `${userText}. Got it.`,
      business_type: `That's a solid business. I can work with that.`,
      audience: `I'll keep that audience in mind for every piece of content and every lead signal.`,
      challenges: `That's where I start. I'll handle it.`,
      tools: `I'll connect to all of those. Your data stays where it is — I just read it and act on it.`,
      goals: `I'll track that target every week. If we're behind, I'll tell you why and what to change.`,
      platforms: `Good choices. I'll optimize for each one differently — what works on LinkedIn doesn't work on Instagram.`,
      voice: `Noted. Every piece of content I generate will sound like that, not like a robot.`,
    }

    const ack = acks[stepId ?? '']
    if (ack) {
      addJarvisMessage(ack)
      await new Promise(r => setTimeout(r, 500))
    }

    const nextStep = step + 1

    // Handle completion
    if (nextStep >= ONBOARD_STEPS.length - 1) {
      // Save profile and finish
      await fetch('/api/onboard/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: newProfile, userName }),
      }).catch(() => {})

      setIsTyping(true)
      await new Promise(r => setTimeout(r, 800))
      setIsTyping(false)

      addJarvisMessage(`That's everything I need to start.`)
      await new Promise(r => setTimeout(r, 600))
      addJarvisMessage(`I'm activating your agents now: content engine, lead intelligence, business analytics, morning brief. By tomorrow morning I'll have your first content plan ready.`)
      await new Promise(r => setTimeout(r, 800))
      addJarvisMessage(`You can talk to me anytime. I'll keep getting smarter about your business every day.`)
      setComplete(true)
      return
    }

    setStep(nextStep)
  }

  return (
    <div style={{
      background: '#00040e', minHeight: '100vh', color: 'white',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 32px', borderBottom: `1px solid ${cyan}15`,
        display: 'flex', alignItems: 'center', gap: 16,
        background: 'rgba(0,4,14,0.95)',
      }}>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>
          JARVIS<span style={{ color: gold }}>OS</span>
        </div>
        <div style={{ width: 1, height: 20, background: `${cyan}20` }} />
        <div style={{ fontSize: 10, letterSpacing: '0.2em', color: `${cyan}50` }}>ONBOARDING</div>
        {step > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {ONBOARD_STEPS.slice(1, -1).map((_, i) => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: '50%',
                background: i < step - 1 ? cyan : i === step - 1 ? `${cyan}60` : `${cyan}15`,
              }} />
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px', maxWidth: 700, width: '100%', margin: '0 auto' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex',
            flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
            gap: 12, marginBottom: 20,
          }}>
            {msg.role === 'jarvis' && (
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: `${cyan}15`, border: `1px solid ${cyan}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: cyan, letterSpacing: '0.1em',
              }}>J</div>
            )}
            <div style={{
              maxWidth: '75%',
              padding: '12px 16px',
              background: msg.role === 'jarvis' ? 'rgba(0,212,255,0.05)' : 'rgba(201,168,76,0.08)',
              border: `1px solid ${msg.role === 'jarvis' ? `${cyan}15` : `${gold}20`}`,
              borderRadius: msg.role === 'jarvis' ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
              fontSize: 15, lineHeight: 1.6,
              color: msg.role === 'jarvis' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.7)',
            }}>
              {msg.text}
            </div>
          </div>
        ))}

        {isTyping && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: `${cyan}15`, border: `1px solid ${cyan}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700, color: cyan,
            }}>J</div>
            <div style={{
              padding: '14px 18px',
              background: 'rgba(0,212,255,0.05)',
              border: `1px solid ${cyan}15`,
              borderRadius: '4px 16px 16px 16px',
              display: 'flex', gap: 6, alignItems: 'center',
            }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: `${cyan}60`,
                  animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}

        {complete && (
          <div style={{
            marginTop: 32, padding: 28,
            border: `1px solid ${green}30`,
            background: `${green}06`,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>✓</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: green, marginBottom: 8 }}>
              You're set up.
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 24 }}>
              Check your Slack tomorrow morning for your first content plan.
            </div>
            <a href="/" style={{
              display: 'inline-block', padding: '12px 32px',
              background: `${cyan}15`, border: `1px solid ${cyan}30`,
              color: cyan, fontSize: 13, fontWeight: 600, letterSpacing: '0.1em',
              textDecoration: 'none',
            }}>
              OPEN JARVIS →
            </a>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {!complete && step > 0 && (
        <div style={{
          padding: '20px 32px',
          borderTop: `1px solid ${cyan}10`,
          background: 'rgba(0,4,14,0.98)',
          maxWidth: 700, width: '100%', margin: '0 auto',
          boxSizing: 'border-box',
        }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 12 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Type your answer..."
              style={{
                flex: 1, padding: '14px 18px',
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${cyan}20`,
                color: 'white', fontSize: 15, outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <button type="submit" disabled={!input.trim()} style={{
              padding: '14px 24px',
              background: input.trim() ? `${cyan}15` : 'transparent',
              border: `1px solid ${input.trim() ? `${cyan}40` : `${cyan}15`}`,
              color: input.trim() ? cyan : `${cyan}30`,
              fontSize: 13, fontWeight: 700, letterSpacing: '0.1em',
              cursor: input.trim() ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
            }}>
              SEND
            </button>
          </form>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
