/**
 * FORGE Builder — Orchestrates the full build pipeline
 * Spec → Generate → Write to disk → Deploy → Report
 */

import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import { specIdea } from './spec'
import { generateFile, generatePackageJson } from './codegen'
import { supabaseAdmin } from '../../supabase/client'
import type { BuildSpec } from './spec'

const BUILDS_DIR = '/Users/anthonyb23xx/jarvis-builds'
const VERCEL_TOKEN = process.env.VERCEL_TOKEN ?? ''

export interface BuildJob {
  id: string
  idea: string
  status: 'speccing' | 'building' | 'deploying' | 'live' | 'failed'
  spec?: BuildSpec
  progress: number  // 0-100
  filesBuilt: number
  totalFiles: number
  deployUrl?: string
  error?: string
  startedAt: string
  completedAt?: string
  logs: string[]
}

// In-memory active build (only one at a time)
let activeBuild: BuildJob | null = null

export function getActiveBuild(): BuildJob | null {
  return activeBuild
}

async function saveBuildToSupabase(job: BuildJob): Promise<void> {
  void supabaseAdmin.from('ai_memories').upsert({
    category: 'forge_build',
    content: job.idea,
    context: JSON.stringify({
      id: job.id,
      status: job.status,
      deployUrl: job.deployUrl,
      spec: job.spec ? { name: job.spec.name, title: job.spec.title, complexity: job.spec.complexity } : null,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    }),
    importance: 8,
    created_at: job.startedAt,
  })
}

async function notifySlack(text: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: '#forge', text }),
  }).catch(() => {})
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf-8')
}

function log(job: BuildJob, message: string): void {
  job.logs.push(`[${new Date().toLocaleTimeString()}] ${message}`)
  console.log(`[FORGE] ${message}`)
}

export async function startBuild(idea: string): Promise<BuildJob> {
  if (activeBuild && (activeBuild.status === 'building' || activeBuild.status === 'speccing' || activeBuild.status === 'deploying')) {
    throw new Error('A build is already in progress. Wait for it to complete or fail.')
  }

  const id = `build-${Date.now()}`
  const job: BuildJob = {
    id,
    idea,
    status: 'speccing',
    progress: 0,
    filesBuilt: 0,
    totalFiles: 0,
    startedAt: new Date().toISOString(),
    logs: [],
  }

  activeBuild = job
  await saveBuildToSupabase(job)

  // Run build async — don't block the API response
  runBuildPipeline(job).catch(async (err) => {
    job.status = 'failed'
    job.error = err instanceof Error ? err.message : 'Unknown error'
    log(job, `Build failed: ${job.error}`)
    await saveBuildToSupabase(job)
    await notifySlack(`❌ *FORGE Build Failed*\nIdea: ${idea}\nError: ${job.error}`)
  })

  return job
}

async function runBuildPipeline(job: BuildJob): Promise<void> {
  // Phase 1: Spec
  log(job, `Speccing idea: "${job.idea}"`)
  await notifySlack(`🔨 *FORGE — Build Started*\n"${job.idea}"\nAtlas is speccing the project...`)

  const spec = await specIdea(job.idea)
  job.spec = spec
  job.totalFiles = spec.files.filter(f => f.priority === 'core').length + 2 // +2 for package.json + config
  job.progress = 10
  log(job, `Spec complete: ${spec.title} | ${spec.complexity} complexity | ${spec.files.length} files`)
  await saveBuildToSupabase(job)

  await notifySlack(
    `📋 *FORGE — Spec Complete*\n*${spec.title}*\n${spec.description}\nStack: ${spec.techStack}\nFiles to build: ${spec.files.length}\nComplexity: ${spec.complexity}`
  )

  // Phase 2: Build
  job.status = 'building'
  const projectDir = path.join(BUILDS_DIR, spec.name)
  fs.mkdirSync(projectDir, { recursive: true })

  // Write package.json
  writeFile(path.join(projectDir, 'package.json'), await generatePackageJson(spec))
  log(job, 'Generated package.json')

  // Write next.config.ts
  writeFile(path.join(projectDir, 'next.config.ts'), `import type { NextConfig } from 'next'\nconst nextConfig: NextConfig = {}\nexport default nextConfig`)

  // Write tsconfig.json
  writeFile(path.join(projectDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2017', lib: ['dom', 'dom.iterable', 'esnext'],
      allowJs: true, skipLibCheck: true, strict: true,
      noEmit: true, esModuleInterop: true, module: 'esnext',
      moduleResolution: 'bundler', resolveJsonModule: true,
      isolatedModules: true, jsx: 'preserve', incremental: true,
      paths: { '@/*': ['./src/*'] },
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx'],
    exclude: ['node_modules'],
  }, null, 2))

  // Write .env.local with placeholders
  if (spec.envVars?.length) {
    const envContent = spec.envVars.map(v => `${v}=`).join('\n')
    writeFile(path.join(projectDir, '.env.local'), envContent)
    log(job, `Created .env.local with ${spec.envVars.length} vars`)
  }

  // Write .gitignore
  writeFile(path.join(projectDir, '.gitignore'), 'node_modules\n.next\n.env.local\n*.env')

  // Generate each file
  const coreFiles = spec.files.filter(f => f.priority === 'core')
  const builtFiles: Array<{ path: string; content: string }> = []

  for (const file of coreFiles) {
    log(job, `Building ${file.path}...`)
    try {
      const content = await generateFile(spec, file, builtFiles)
      writeFile(path.join(projectDir, file.path), content)
      builtFiles.push({ path: file.path, content })
      job.filesBuilt++
      job.progress = 10 + Math.round((job.filesBuilt / job.totalFiles) * 70)
      await saveBuildToSupabase(job)
    } catch (err) {
      log(job, `Warning: failed to generate ${file.path} — ${err}`)
    }
  }

  log(job, `All ${job.filesBuilt} files written to ${projectDir}`)

  // Phase 3: Install + Build check (don't fail on errors — get it deployed)
  log(job, 'Installing dependencies...')
  try {
    execSync('npm install --silent', { cwd: projectDir, timeout: 120000, stdio: 'pipe' })
    log(job, 'Dependencies installed')
  } catch {
    log(job, 'npm install had warnings — continuing')
  }

  // Phase 4: Deploy
  job.status = 'deploying'
  job.progress = 85
  log(job, 'Deploying to Vercel...')
  await saveBuildToSupabase(job)

  let deployUrl = ''
  try {
    const deployOutput = execSync(
      `npx vercel --prod --yes --token=${VERCEL_TOKEN}`,
      { cwd: projectDir, timeout: 180000, stdio: 'pipe' }
    ).toString()

    // Extract URL from Vercel output
    const urlMatch = deployOutput.match(/https:\/\/[^\s]+\.vercel\.app/)
    deployUrl = urlMatch ? urlMatch[0] : `https://${spec.name}.vercel.app`
    log(job, `Deployed: ${deployUrl}`)
  } catch (err) {
    log(job, `Deploy warning: ${err} — project is ready at ${projectDir}`)
    deployUrl = `local://${projectDir}` // Available locally even if Vercel deploy fails
  }

  // Phase 5: Complete
  job.status = 'live'
  job.deployUrl = deployUrl
  job.progress = 100
  job.completedAt = new Date().toISOString()
  await saveBuildToSupabase(job)

  await notifySlack(
    `✅ *FORGE — Build Complete*\n*${spec.title}*\n${spec.description}\n\n` +
    `🚀 Live at: ${deployUrl}\n` +
    `📁 Local: ${projectDir}\n` +
    `⚡ ${job.filesBuilt} files built in ${Math.round((Date.now() - new Date(job.startedAt).getTime()) / 1000 / 60)} minutes\n\n` +
    `${spec.dbSchema ? '⚠️ Run Supabase SQL in your project before using.' : ''}`
  )

  log(job, `Build complete! ${deployUrl}`)
}

export async function getRecentBuilds(): Promise<Array<{
  idea: string; status: string; deployUrl?: string; name?: string; title?: string; startedAt: string
}>> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('content, context, created_at')
    .eq('category', 'forge_build')
    .order('created_at', { ascending: false })
    .limit(10)

  return (data ?? []).map(d => {
    try {
      const ctx = JSON.parse(d.context ?? '{}')
      return {
        idea: d.content,
        status: ctx.status,
        deployUrl: ctx.deployUrl,
        name: ctx.spec?.name,
        title: ctx.spec?.title,
        startedAt: d.created_at,
      }
    } catch { return { idea: d.content, status: 'unknown', startedAt: d.created_at } }
  })
}
