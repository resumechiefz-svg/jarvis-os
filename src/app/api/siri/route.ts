/**
 * Siri Shortcut endpoint — opens Jarvis voice instantly
 * iOS Shortcut: Open URL → this endpoint → redirects to voice-ready mobile chat
 * Setup: Shortcuts app → + → Open URLs → paste this URL → Add to Siri → "Hey Siri, Jarvis"
 */
import { NextResponse } from 'next/server'
export async function GET() {
  // Redirect to Jarvis with voice auto-start
  // Middleware now allows this route publicly so it won't be blocked
  const base = 'https://jarvis-os-dusky.vercel.app'
  return NextResponse.redirect(`${base}/?voice=1`)
}
