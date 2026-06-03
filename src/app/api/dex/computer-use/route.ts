/**
 * /api/dex/computer-use — Dex "take the wheel" endpoint
 *
 * Streams SSE events as Dex works through a task using Claude's computer_use API.
 * Loop: screenshot → Claude decides action → execute → screenshot → repeat until done.
 *
 * Events streamed:
 *   { type: 'status',     message: string }          — what Dex is doing
 *   { type: 'screenshot', data: string }              — base64 PNG of current screen
 *   { type: 'action',     action: string, desc: string } — action being taken
 *   { type: 'thought',    text: string }              — Claude's reasoning
 *   { type: 'done',       summary: string }           — task complete
 *   { type: 'error',      message: string }           — something failed
 */

import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { takeScreenshot, getScreenSize, executeAction } from '@/lib/agents/dex-computer'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Safety limits
const MAX_TURNS = 25      // max back-and-forth turns before auto-stop
const MAX_RUNTIME = 300   // 5 minutes max per task

const DEX_COMPUTER_SYSTEM = `You are DEX — Jarvis OS system integrity agent operating in computer control mode.

You have full control of AB's Mac. You are meticulous, precise, and narrate every action before taking it.

Your operating principles:
- ALWAYS take a screenshot first before acting to understand current screen state
- NEVER delete files without explicit confirmation
- NEVER access financial accounts, passwords, or sensitive credentials
- ALWAYS prefer reversible actions over irreversible ones
- If unsure, take a screenshot and describe what you see rather than guessing
- Work in Terminal when possible — it's more reliable than GUI automation
- Report progress clearly so AB can follow what you're doing
- When done, take a final screenshot to confirm the task completed successfully

Project paths:
- Jarvis OS: ~/jarvis-os (Next.js app, this codebase)
- ResumeChiefz: ~/Desktop/resumechiefz (SaaS product)
- Card Engine: ~/ebay-card-engine

Task execution style:
- Narrate each step: "Opening Terminal...", "Running npm install...", "Checking error log..."
- If you hit an error, diagnose before retrying
- Stop and report if something unexpected appears that AB should see
- Prefer: Terminal > Finder > Browser > Other apps`

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const { task, aborted } = await req.json()
  if (!task) return Response.json({ error: 'No task provided' }, { status: 400 })

  const encoder = new TextEncoder()
  const screenSize = await getScreenSize()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch { /* stream closed */ }
      }

      const startTime = Date.now()
      let turns = 0
      let stopped = false

      // Abort signal check
      const checkAbort = () => {
        if (aborted) { stopped = true }
        if (Date.now() - startTime > MAX_RUNTIME * 1000) {
          stopped = true
          send({ type: 'error', message: `Task exceeded ${MAX_RUNTIME}s time limit — stopping.` })
        }
      }

      send({ type: 'status', message: `Taking the wheel. Task: "${task}"` })

      // Build messages array for computer use loop
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages: any[] = [{ role: 'user', content: task }]

      try {
        while (!stopped && turns < MAX_TURNS) {
          checkAbort()
          if (stopped) break
          turns++

          send({ type: 'status', message: `Turn ${turns}/${MAX_TURNS} — thinking...` })

          // Call Claude with computer_use tool
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const response = await (anthropic.beta.messages as any).create({
            model: 'claude-sonnet-4-5',
            max_tokens: 4096,
            system: DEX_COMPUTER_SYSTEM,
            tools: [{
              type: 'computer_20250124',
              name: 'computer',
              display_width_px: screenSize.width,
              display_height_px: screenSize.height,
              display_number: 1,
            }],
            messages,
            betas: ['computer-use-2025-01-24'],
          })

          // Surface Claude's text thoughts
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const block of (response.content as any[])) {
            if (block.type === 'text' && block.text?.trim()) {
              send({ type: 'thought', text: block.text.trim() })
            }
          }

          // If no tool calls → task complete
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const content = response.content as any[]
          const toolUseBlocks = content.filter((b: any) => b.type === 'tool_use')
          if (toolUseBlocks.length === 0 || (response as any).stop_reason === 'end_turn') {
            const summary = content.find((b: any) => b.type === 'text')?.text ?? 'Task complete.'
            send({ type: 'done', summary })
            break
          }

          // Add assistant turn to history
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          messages.push({ role: 'assistant', content: response.content as any })

          // Execute each tool call and collect results
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const toolResults: any[] = []

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const block of toolUseBlocks as any[]) {
            if (block.type !== 'tool_use') continue
            checkAbort()
            if (stopped) break

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const input = block.input as any
            const actionType = input.action as string

            // Describe the action to the UI
            const desc = describeAction(input)
            send({ type: 'action', action: actionType, desc })

            try {
              const result = await executeAction(input)

              // If it's a screenshot, stream it to the UI
              if (actionType === 'screenshot' && typeof result === 'object' && 'source' in result) {
                send({ type: 'screenshot', data: result.source.data })
                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: [result],
                })
              } else {
                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: typeof result === 'string' ? result : JSON.stringify(result),
                })
              }
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : 'Action failed'
              send({ type: 'status', message: `Action error: ${errMsg} — continuing...` })
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: `Error: ${errMsg}`,
                is_error: true,
              })
            }
          }

          if (toolResults.length > 0) {
            messages.push({ role: 'user', content: toolResults })
          }

          // Small pause between turns to avoid hammering
          await new Promise(r => setTimeout(r, 500))
        }

        if (turns >= MAX_TURNS) {
          send({ type: 'error', message: `Reached ${MAX_TURNS} turn limit. Task may be incomplete — check screen.` })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        send({ type: 'error', message: `Dex computer mode failed: ${msg}` })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

function describeAction(input: Record<string, unknown>): string {
  const type = input.action as string
  const coord = input.coordinate as [number, number] | undefined
  switch (type) {
    case 'screenshot':     return 'Taking screenshot...'
    case 'left_click':     return `Clicking at (${coord?.[0]}, ${coord?.[1]})`
    case 'right_click':    return `Right-clicking at (${coord?.[0]}, ${coord?.[1]})`
    case 'double_click':   return `Double-clicking at (${coord?.[0]}, ${coord?.[1]})`
    case 'type':           return `Typing: "${String(input.text).slice(0, 40)}${String(input.text).length > 40 ? '...' : ''}"`
    case 'key':            return `Pressing: ${input.text}`
    case 'scroll':         return `Scrolling ${input.direction} at (${coord?.[0]}, ${coord?.[1]})`
    case 'mouse_move':     return `Moving mouse to (${coord?.[0]}, ${coord?.[1]})`
    default:               return `${type}...`
  }
}
