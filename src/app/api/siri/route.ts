/**
 * Siri Shortcut endpoint — opens Jarvis voice instantly
 * iOS Shortcut: Open URL → this endpoint → redirects to voice-ready mobile chat
 * Setup: Shortcuts app → + → Open URLs → paste this URL → Add to Siri → "Hey Siri, Jarvis"
 */
import { NextResponse } from 'next/server'
export async function GET() {
  // Redirect to mobile chat with voice auto-start param
  return NextResponse.redirect(new URL('/?voice=1', process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3001'))
}
