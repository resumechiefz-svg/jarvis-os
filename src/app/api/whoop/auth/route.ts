import { NextResponse } from 'next/server'
import { getWhoopAuthUrl } from '@/lib/agents/whoop'
export async function GET() { return NextResponse.redirect(getWhoopAuthUrl()) }
