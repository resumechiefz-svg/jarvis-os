/**
 * DEX Code Reader — gives Jarvis access to read actual codebase files
 * Enables full-context debugging without copy-pasting
 */
import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'

const ROOT = resolve(process.cwd())
const ALLOWED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.md', '.sql', '.py']
const BLOCKED_PATHS = ['node_modules', '.git', '.next', '.env', 'dist', 'build']

function isAllowed(filePath: string): boolean {
  const rel = filePath.replace(ROOT, '')
  return !BLOCKED_PATHS.some(b => rel.includes(b)) &&
    ALLOWED_EXTENSIONS.some(ext => filePath.endsWith(ext))
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const path = searchParams.get('path')
  const list = searchParams.get('list')

  // List files in a directory
  if (list) {
    const dir = resolve(ROOT, list.replace(/^\//, ''))
    if (!dir.startsWith(ROOT)) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    try {
      const entries = readdirSync(dir).filter(f => {
        const full = join(dir, f)
        return !BLOCKED_PATHS.includes(f) && (statSync(full).isDirectory() || ALLOWED_EXTENSIONS.some(e => f.endsWith(e)))
      })
      return NextResponse.json({ dir: list, entries })
    } catch { return NextResponse.json({ error: 'Directory not found' }, { status: 404 }) }
  }

  // Read a specific file
  if (path) {
    const full = resolve(ROOT, path.replace(/^\//, ''))
    if (!full.startsWith(ROOT) || !isAllowed(full)) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    try {
      const content = readFileSync(full, 'utf-8')
      const lines = content.split('\n').length
      return NextResponse.json({ path, content: content.slice(0, 20000), lines, truncated: content.length > 20000 })
    } catch { return NextResponse.json({ error: 'File not found' }, { status: 404 }) }
  }

  // Default: list src directory
  const srcDir = join(ROOT, 'src')
  const entries = readdirSync(srcDir)
  return NextResponse.json({ root: 'src/', entries })
}
