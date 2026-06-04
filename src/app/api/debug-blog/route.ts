import { NextResponse } from 'next/server'
import * as path from 'path'
import * as fs from 'fs/promises'

export async function GET() {
  const home = process.env.HOME
  const RC_DIR = path.join(home ?? '/Users/anthonyb23xx', 'Desktop/resumechiefz')
  const BLOG_DIR = path.join(RC_DIR, 'public/blog')
  
  const exists = await fs.access(BLOG_DIR).then(() => true).catch(() => false)
  
  // Try writing a test file
  const testPath = path.join(BLOG_DIR, 'debug-test.html')
  let writeResult = 'unknown'
  try {
    await fs.writeFile(testPath, 'test', 'utf-8')
    await fs.unlink(testPath)
    writeResult = 'SUCCESS'
  } catch(e: unknown) {
    writeResult = e instanceof Error ? e.message : 'error'
  }
  
  return NextResponse.json({ home, RC_DIR, blogDirExists: exists, writeResult, cwd: process.cwd() })
}
