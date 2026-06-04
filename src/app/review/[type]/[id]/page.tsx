'use client'
/**
 * Content Review Screen — pops up when final content is ready
 * Shows the actual final product (video player, carousel, post preview)
 * Approve → posts. Revise → sends notes back to Claude.
 */
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'

interface ReviewItem {
  id: string
  type: 'youtube' | 'instagram' | 'linkedin' | 'blog'
  channel: string
  title: string
  status: 'pending' | 'approved' | 'revised' | 'discarded'
  // YouTube
  videoUrl?: string
  thumbnailUrl?: string
  script?: string
  description?: string
  tags?: string[]
  // Instagram
  slides?: Array<{ imageUrl: string; caption: string }>
  // LinkedIn
  postText?: string
  // Blog
  blogUrl?: string
  excerpt?: string
  // Meta
  createdAt: string
  notes?: string
}

const cyan = '#00d4ff'
const gold = '#c9a84c'
const green = '#00ff88'

export default function ReviewPage() {
  const params = useParams()
  const type = params.type as string
  const id = params.id as string

  const [item, setItem] = useState<ReviewItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState('')
  const [action, setAction] = useState<'idle' | 'approving' | 'revising' | 'discarding' | 'done'>('idle')
  const [result, setResult] = useState('')

  useEffect(() => {
    fetch(`/api/review/${type}/${id}`)
      .then(r => r.json())
      .then(setItem)
      .catch(() => setLoading(false))
      .finally(() => setLoading(false))
  }, [type, id])

  const approve = useCallback(async () => {
    setAction('approving')
    const res = await fetch(`/api/review/${type}/${id}/approve`, { method: 'POST' })
    const data = await res.json() as { ok: boolean; url?: string; error?: string }
    setAction('done')
    setResult(data.ok ? `✅ Posted! ${data.url ?? ''}` : `Failed: ${data.error}`)
  }, [type, id])

  const revise = useCallback(async () => {
    if (!notes.trim()) return
    setAction('revising')
    const res = await fetch(`/api/review/${type}/${id}/revise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    })
    const data = await res.json() as { ok: boolean; newId?: string }
    setAction('done')
    if (data.ok && data.newId) {
      setResult('Revised version generating...')
      setTimeout(() => window.location.href = `/review/${type}/${data.newId}`, 2000)
    }
  }, [type, id, notes])

  const discard = useCallback(async () => {
    setAction('discarding')
    await fetch(`/api/review/${type}/${id}/discard`, { method: 'POST' })
    setAction('done')
    setResult('🗑️ Discarded.')
  }, [type, id])

  if (loading) return (
    <div style={{ background: '#00040e', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: cyan, fontFamily: 'monospace', letterSpacing: '0.2em', fontSize: 12 }}>LOADING CONTENT...</div>
    </div>
  )

  if (!item) return (
    <div style={{ background: '#00040e', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#ff4455', fontFamily: 'monospace', fontSize: 12 }}>CONTENT NOT FOUND — ID: {id}</div>
    </div>
  )

  const isDone = action === 'done'

  return (
    <div style={{
      background: '#00040e', minHeight: '100vh', color: 'white',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 32px',
        borderBottom: `1px solid ${cyan}20`,
        background: 'rgba(0,4,14,0.95)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.3em', color: `${cyan}60` }}>JARVIS OS</div>
          <div style={{ width: 1, height: 16, background: `${cyan}20` }} />
          <div style={{ fontSize: 9, letterSpacing: '0.25em', color: `${cyan}80` }}>
            {type.toUpperCase()} REVIEW
          </div>
          <div style={{
            padding: '2px 8px', fontSize: 8, letterSpacing: '0.15em',
            background: 'rgba(255,165,0,0.1)', border: '1px solid rgba(255,165,0,0.3)',
            color: '#ffa500',
          }}>
            PENDING APPROVAL
          </div>
        </div>
        <div style={{ fontSize: 9, color: `${cyan}30`, letterSpacing: '0.1em' }}>
          {new Date(item.createdAt).toLocaleString()}
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>

        {/* Title */}
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'white', marginBottom: 8, lineHeight: 1.3 }}>
          {item.title}
        </h1>
        <div style={{ fontSize: 12, color: `${cyan}60`, marginBottom: 32, letterSpacing: '0.1em' }}>
          {item.channel.toUpperCase()} · {type.toUpperCase()}
        </div>

        {/* ── YouTube video player ── */}
        {type === 'youtube' && (
          <div style={{ marginBottom: 32 }}>
            {item.videoUrl ? (
              <div style={{ position: 'relative', paddingBottom: '56.25%', background: '#000', border: `1px solid ${cyan}20` }}>
                <video
                  src={item.videoUrl}
                  controls
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                  poster={item.thumbnailUrl}
                />
              </div>
            ) : (
              <div style={{
                padding: '48px 24px', border: `1px solid ${cyan}15`,
                background: 'rgba(0,212,255,0.03)', textAlign: 'center',
              }}>
                <div style={{ fontSize: 11, color: `${cyan}40`, letterSpacing: '0.2em', marginBottom: 8 }}>VIDEO RENDERING</div>
                <div style={{ fontSize: 10, color: `${cyan}25` }}>
                  The video is still processing. Check back in a few minutes or approve the script to trigger rendering.
                </div>
              </div>
            )}

            {/* Script preview (collapsed) */}
            <details style={{ marginTop: 16 }}>
              <summary style={{ cursor: 'pointer', fontSize: 10, color: `${cyan}50`, letterSpacing: '0.15em', padding: '8px 0' }}>
                VIEW SCRIPT ▾
              </summary>
              <div style={{
                marginTop: 8, padding: 16,
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${cyan}10`,
                fontSize: 12, lineHeight: 1.8, color: 'rgba(255,255,255,0.6)',
                whiteSpace: 'pre-wrap', maxHeight: 400, overflowY: 'auto',
              }}>
                {item.script}
              </div>
            </details>

            {/* Description */}
            {item.description && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 9, color: `${cyan}40`, letterSpacing: '0.2em', marginBottom: 8 }}>DESCRIPTION</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>{item.description}</div>
              </div>
            )}

            {/* Tags */}
            {item.tags && item.tags.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {item.tags.map(tag => (
                  <span key={tag} style={{
                    padding: '2px 8px', fontSize: 9, letterSpacing: '0.1em',
                    background: `${cyan}10`, border: `1px solid ${cyan}20`, color: `${cyan}70`,
                  }}>
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Instagram carousel ── */}
        {type === 'instagram' && item.slides && (
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 16, marginBottom: 32 }}>
            {item.slides.map((slide, i) => (
              <div key={i} style={{
                flexShrink: 0, width: 280,
                border: `1px solid ${cyan}15`,
                background: 'rgba(0,212,255,0.02)',
              }}>
                {slide.imageUrl && (
                  <img src={slide.imageUrl} alt={`Slide ${i + 1}`}
                    style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                )}
                <div style={{ padding: '8px 12px', fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
                  {slide.caption}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── LinkedIn post ── */}
        {type === 'linkedin' && (
          <div style={{
            padding: 24, border: `1px solid ${cyan}15`,
            background: 'rgba(0,212,255,0.02)', marginBottom: 32,
          }}>
            <div style={{ fontSize: 9, color: `${cyan}40`, letterSpacing: '0.2em', marginBottom: 12 }}>LINKEDIN POST PREVIEW</div>
            <div style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(255,255,255,0.8)', whiteSpace: 'pre-wrap' }}>
              {item.postText}
            </div>
          </div>
        )}

        {/* ── Blog post ── */}
        {type === 'blog' && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, marginBottom: 16 }}>
              {item.excerpt}
            </div>
            {item.blogUrl && (
              <a href={item.blogUrl} target="_blank" rel="noopener noreferrer"
                style={{ color: cyan, fontSize: 11, letterSpacing: '0.1em' }}>
                PREVIEW POST →
              </a>
            )}
          </div>
        )}

        {/* ── Action area ── */}
        {isDone ? (
          <div style={{
            padding: 24, border: `1px solid ${green}30`,
            background: `${green}08`, textAlign: 'center',
          }}>
            <div style={{ fontSize: 16, color: green, fontWeight: 600 }}>{result}</div>
          </div>
        ) : (
          <div style={{ borderTop: `1px solid ${cyan}15`, paddingTop: 24 }}>

            {/* Feedback input */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 9, color: `${cyan}40`, letterSpacing: '0.2em', marginBottom: 8 }}>
                FEEDBACK / REVISION NOTES (optional)
              </div>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Type any changes you want... or just approve if it looks good."
                style={{
                  width: '100%', minHeight: 80, padding: 12,
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${cyan}20`,
                  color: 'white', fontSize: 13, lineHeight: 1.6,
                  resize: 'vertical', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={approve}
                disabled={action !== 'idle'}
                style={{
                  flex: 2, padding: '14px 24px',
                  background: action === 'approving' ? `${green}20` : `${green}15`,
                  border: `1px solid ${green}50`,
                  color: green, fontSize: 13, fontWeight: 700,
                  letterSpacing: '0.15em', cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {action === 'approving' ? 'POSTING...' : '✓ APPROVE & POST'}
              </button>

              {notes.trim() && (
                <button
                  onClick={revise}
                  disabled={action !== 'idle'}
                  style={{
                    flex: 1, padding: '14px 24px',
                    background: 'rgba(201,168,76,0.08)',
                    border: `1px solid ${gold}40`,
                    color: gold, fontSize: 13, fontWeight: 600,
                    letterSpacing: '0.1em', cursor: 'pointer',
                  }}
                >
                  {action === 'revising' ? 'REVISING...' : '↺ REVISE'}
                </button>
              )}

              <button
                onClick={discard}
                disabled={action !== 'idle'}
                style={{
                  padding: '14px 20px',
                  background: 'rgba(255,68,85,0.06)',
                  border: '1px solid rgba(255,68,85,0.2)',
                  color: 'rgba(255,68,85,0.6)', fontSize: 11,
                  letterSpacing: '0.1em', cursor: 'pointer',
                }}
              >
                DISCARD
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
