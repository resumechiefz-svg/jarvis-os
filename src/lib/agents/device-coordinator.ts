/**
 * Device Coordinator — one Jarvis, one active voice session at a time
 * Prevents phone + desktop + Watch all talking simultaneously
 * Uses Supabase as the coordination layer (real-time across devices)
 */
import { supabaseAdmin } from '../supabase/client'

const DEVICE_KEY = 'active_jarvis_device'
const SESSION_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes idle = release the session

export interface DeviceSession {
  deviceId: string
  deviceType: 'desktop' | 'mobile' | 'watch'
  startedAt: string
  lastSeen: string
}

// Register this device as active — returns true if it got the session
export async function claimVoiceSession(deviceId: string, deviceType: 'desktop' | 'mobile' | 'watch'): Promise<{ claimed: boolean; activeDevice?: DeviceSession }> {
  const now = new Date().toISOString()

  // Check current active session
  const { data: current } = await supabaseAdmin
    .from('ai_memories')
    .select('context, created_at')
    .eq('category', DEVICE_KEY)
    .single()

  if (current?.context) {
    try {
      const active = JSON.parse(current.context) as DeviceSession

      // If same device — refresh heartbeat
      if (active.deviceId === deviceId) {
        await supabaseAdmin.from('ai_memories').upsert({
          category: DEVICE_KEY,
          content: deviceId,
          context: JSON.stringify({ ...active, lastSeen: now }),
          importance: 10,
          created_at: now,
        })
        return { claimed: true }
      }

      // If another device is active, check if it timed out
      const lastSeen = new Date(active.lastSeen).getTime()
      const timedOut = Date.now() - lastSeen > SESSION_TIMEOUT_MS

      if (!timedOut) {
        // Another device is live — don't take over
        return { claimed: false, activeDevice: active }
      }
    } catch { /* malformed — proceed */ }
  }

  // Claim the session
  await supabaseAdmin.from('ai_memories').upsert({
    category: DEVICE_KEY,
    content: deviceId,
    context: JSON.stringify({ deviceId, deviceType, startedAt: now, lastSeen: now }),
    importance: 10,
    created_at: now,
  })

  return { claimed: true }
}

// Release this device's session (on close/navigate away)
export async function releaseVoiceSession(deviceId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('context')
    .eq('category', DEVICE_KEY)
    .single()

  if (data?.context) {
    try {
      const active = JSON.parse(data.context) as DeviceSession
      if (active.deviceId === deviceId) {
        await supabaseAdmin.from('ai_memories').delete().eq('category', DEVICE_KEY)
      }
    } catch { /* skip */ }
  }
}

// Heartbeat — call every 30s while voice is active
export async function heartbeat(deviceId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('context')
    .eq('category', DEVICE_KEY)
    .single()

  if (!data?.context) return false

  try {
    const active = JSON.parse(data.context) as DeviceSession
    if (active.deviceId !== deviceId) return false // Lost session

    await supabaseAdmin.from('ai_memories').upsert({
      category: DEVICE_KEY,
      content: deviceId,
      context: JSON.stringify({ ...active, lastSeen: new Date().toISOString() }),
      importance: 10,
      created_at: new Date().toISOString(),
    })
    return true
  } catch { return false }
}

// Forcibly take over — user taps "Take over" on second device
export async function takeOverSession(deviceId: string, deviceType: 'desktop' | 'mobile' | 'watch'): Promise<void> {
  const now = new Date().toISOString()
  await supabaseAdmin.from('ai_memories').upsert({
    category: DEVICE_KEY,
    content: deviceId,
    context: JSON.stringify({ deviceId, deviceType, startedAt: now, lastSeen: now }),
    importance: 10,
    created_at: now,
  })
}
