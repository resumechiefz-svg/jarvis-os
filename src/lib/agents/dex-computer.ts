/**
 * dex-computer.ts — macOS action executor for Dex computer control mode
 *
 * Translates Claude's computer_use tool calls into real macOS actions:
 * screenshot → screencapture, mouse → cliclick / AppleScript, keyboard → osascript
 *
 * Requirements on the host Mac:
 *   - Accessibility access for the Node process (System Preferences → Privacy → Accessibility)
 *   - Screen Recording permission for Terminal / the process launching Next.js
 *   - Optional: brew install cliclick (for reliable mouse control)
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs/promises'

const execAsync = promisify(exec)

export interface ScreenSize { width: number; height: number }
export type ComputerAction =
  | { type: 'screenshot' }
  | { type: 'left_click';     coordinate: [number, number] }
  | { type: 'right_click';    coordinate: [number, number] }
  | { type: 'double_click';   coordinate: [number, number] }
  | { type: 'middle_click';   coordinate: [number, number] }
  | { type: 'mouse_move';     coordinate: [number, number] }
  | { type: 'left_click_drag'; startCoordinate: [number, number]; coordinate: [number, number] }
  | { type: 'type';           text: string }
  | { type: 'key';            text: string }
  | { type: 'scroll';         coordinate: [number, number]; direction: 'up'|'down'|'left'|'right'; amount: number }
  | { type: 'cursor_position' }

// ── Screenshot ───────────────────────────────────────────────────────────────
export async function takeScreenshot(): Promise<{ base64: string; mediaType: 'image/png' }> {
  const path = `/tmp/dex_screen_${Date.now()}.png`
  await execAsync(`screencapture -x -t png "${path}"`)
  const buf = await fs.readFile(path)
  await fs.unlink(path).catch(() => {})
  return { base64: buf.toString('base64'), mediaType: 'image/png' }
}

// ── Get screen dimensions ────────────────────────────────────────────────────
export async function getScreenSize(): Promise<ScreenSize> {
  try {
    const { stdout } = await execAsync(
      `osascript -e 'tell application "Finder" to get bounds of window of desktop'`
    )
    const parts = stdout.trim().split(', ')
    return { width: parseInt(parts[2]), height: parseInt(parts[3]) }
  } catch {
    return { width: 1440, height: 900 } // macOS default fallback
  }
}

// ── Mouse via cliclick (fallback: AppleScript) ───────────────────────────────
async function click(x: number, y: number, type: 'left' | 'right' | 'double' = 'left') {
  try {
    // cliclick is more reliable — install with: brew install cliclick
    const flag = type === 'right' ? 'rc' : type === 'double' ? 'dc' : 'c'
    await execAsync(`cliclick ${flag}:${x},${y}`)
  } catch {
    // AppleScript fallback
    const btn = type === 'right' ? 'right' : 'primary'
    await execAsync(
      `osascript -e 'tell application "System Events" to ${btn} button down at {${x}, ${y}}'` +
      ` -e 'tell application "System Events" to ${btn} button up at {${x}, ${y}}'`
    )
  }
}

async function moveMouse(x: number, y: number) {
  try {
    await execAsync(`cliclick m:${x},${y}`)
  } catch {
    // No direct osascript move — use cliclick only
  }
}

// ── Keyboard ─────────────────────────────────────────────────────────────────
// Maps Claude's key names to AppleScript/osascript equivalents
const KEY_MAP: Record<string, string> = {
  'Return': 'return', 'Enter': 'return',
  'Tab': 'tab', 'Escape': 'escape', 'space': 'space',
  'BackSpace': 'delete', 'Delete': 'forward delete',
  'Up': 'up arrow', 'Down': 'down arrow', 'Left': 'left arrow', 'Right': 'right arrow',
  'Home': 'home', 'End': 'end', 'Page_Up': 'page up', 'Page_Down': 'page down',
  'F1':'f1','F2':'f2','F3':'f3','F4':'f4','F5':'f5','F6':'f6',
  'F7':'f7','F8':'f8','F9':'f9','F10':'f10','F11':'f11','F12':'f12',
}

function buildKeyScript(keyStr: string): string {
  // Handle combos like "ctrl+c", "super+t", "ctrl+shift+t"
  const parts = keyStr.split('+')
  const mods: string[] = []
  let key = ''

  for (const part of parts) {
    const p = part.trim().toLowerCase()
    if (p === 'ctrl' || p === 'control') mods.push('control down')
    else if (p === 'super' || p === 'cmd' || p === 'command') mods.push('command down')
    else if (p === 'alt' || p === 'option') mods.push('option down')
    else if (p === 'shift') mods.push('shift down')
    else key = KEY_MAP[part] ?? part.toLowerCase()
  }

  const usingClause = mods.length > 0 ? ` using {${mods.join(', ')}}` : ''

  // For special keys: use 'key code' or named key
  const isSpecial = Object.values(KEY_MAP).includes(key) || key.startsWith('f')
  if (isSpecial) {
    return `tell application "System Events" to key code (key code of "${key}")${usingClause}`
  }
  return `tell application "System Events" to keystroke "${key}"${usingClause}`
}

// ── Execute a single computer action ────────────────────────────────────────
export async function executeAction(action: ComputerAction): Promise<string | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }> {
  switch (action.type) {
    case 'screenshot': {
      const { base64, mediaType } = await takeScreenshot()
      return { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }
    }

    case 'left_click':
      await click(action.coordinate[0], action.coordinate[1], 'left')
      return 'clicked'

    case 'right_click':
      await click(action.coordinate[0], action.coordinate[1], 'right')
      return 'right-clicked'

    case 'double_click':
      await click(action.coordinate[0], action.coordinate[1], 'double')
      return 'double-clicked'

    case 'middle_click':
      // Middle click via AppleScript
      await execAsync(
        `osascript -e 'tell application "System Events" to click at {${action.coordinate[0]}, ${action.coordinate[1]}} button middle'`
      ).catch(() => {}) // Not all mice support middle click; fail silently
      return 'middle-clicked'

    case 'mouse_move':
      await moveMouse(action.coordinate[0], action.coordinate[1])
      return 'moved'

    case 'left_click_drag':
      try {
        await execAsync(
          `cliclick dd:${action.startCoordinate[0]},${action.startCoordinate[1]} m:${action.coordinate[0]},${action.coordinate[1]} du:${action.coordinate[0]},${action.coordinate[1]}`
        )
      } catch {
        // Fallback: click-hold drag via AppleScript
        await execAsync(`osascript -e 'tell application "System Events" to drag to {${action.coordinate[0]}, ${action.coordinate[1]}} from {${action.startCoordinate[0]}, ${action.startCoordinate[1]}}'`)
      }
      return 'dragged'

    case 'type':
      // Type text character by character for reliability
      await execAsync(`osascript -e 'tell application "System Events" to keystroke "${action.text.replace(/"/g, '\\"').replace(/\\/g, '\\\\')}"'`)
      return 'typed'

    case 'key': {
      const script = buildKeyScript(action.text)
      await execAsync(`osascript -e '${script}'`)
      return 'key pressed'
    }

    case 'scroll': {
      const [x, y] = action.coordinate
      const n = action.amount ?? 3
      try {
        const dir = action.direction === 'up' ? `-${n}` : action.direction === 'down' ? `${n}` :
                    action.direction === 'left' ? `0 -${n}` : `0 ${n}`
        await execAsync(`cliclick ms:${x},${y}:${dir}`)
      } catch {
        // AppleScript scroll fallback
        const scrollDir = action.direction === 'up' || action.direction === 'left' ? -n : n
        await execAsync(
          `osascript -e 'tell application "System Events" to scroll at {${x}, ${y}} by {0, ${scrollDir}}'`
        )
      }
      return 'scrolled'
    }

    case 'cursor_position': {
      try {
        const { stdout } = await execAsync(`osascript -e 'tell application "System Events" to get position of mouse'`)
        return stdout.trim()
      } catch {
        return '0, 0'
      }
    }

    default:
      return 'unknown action'
  }
}
