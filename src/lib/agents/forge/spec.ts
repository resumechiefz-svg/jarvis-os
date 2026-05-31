/**
 * FORGE Spec Engine — Atlas turns AB's idea into a structured build spec
 * Model: claude-sonnet-4-6 (smart architecture decisions)
 * Cached system prompt for efficiency
 */

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const ATLAS_BUILDER_SYSTEM = `You are ATLAS — elite software architect at AB's command center. You turn business ideas into precise, buildable specs.

AB is a non-technical founder. He describes ideas in plain English. You translate them into:
- A clear product definition (what it does, who it's for)
- MVP scope (exactly what ships in v1 — no feature creep)
- Tech stack decision (Next.js + Tailwind + Supabase by default unless another stack fits better)
- Complete file structure with every file that needs to be created
- Key features ranked by priority
- Database schema if needed
- Deployment target (Vercel always)
- Estimated build complexity: simple (1-3 files), moderate (4-10 files), complex (10+ files)

Be decisive. AB doesn't want options — he wants a plan. Choose the stack, define the scope, list the files. Make it real.`

export interface BuildSpec {
  name: string           // project-name (kebab-case, used for directory and Vercel)
  title: string          // "Customer Feedback Dashboard"
  description: string    // what it does in 2 sentences
  techStack: string      // "Next.js 15 + TypeScript + Tailwind + Supabase"
  mvpFeatures: string[]  // exactly what ships
  files: Array<{
    path: string         // "src/app/page.tsx"
    description: string  // "Main dashboard with feedback table"
    priority: 'core' | 'secondary' // core = must have, secondary = nice to have
  }>
  dbSchema?: string      // SQL for any tables needed
  envVars?: string[]     // STRIPE_KEY, SUPABASE_URL, etc
  complexity: 'simple' | 'moderate' | 'complex'
  estimatedMinutes: number
}

export async function specIdea(idea: string): Promise<BuildSpec> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: [
      {
        type: 'text',
        text: ATLAS_BUILDER_SYSTEM,
        cache_control: { type: 'ephemeral' },
      }
    ] as Parameters<typeof anthropic.messages.create>[0]['system'],
    messages: [{
      role: 'user',
      content: `AB's idea: "${idea}"\n\nCreate a complete build spec. Return ONLY valid JSON matching this schema:\n{\n  "name": "kebab-case-project-name",\n  "title": "Human Readable Title",\n  "description": "What it does in 2 sentences.",\n  "techStack": "Next.js 15 + TypeScript + Tailwind CSS",\n  "mvpFeatures": ["Feature 1", "Feature 2"],\n  "files": [\n    {"path": "src/app/page.tsx", "description": "...", "priority": "core"},\n    {"path": "src/app/api/data/route.ts", "description": "...", "priority": "core"}\n  ],\n  "dbSchema": "CREATE TABLE IF NOT EXISTS ...",\n  "envVars": ["NEXT_PUBLIC_SUPABASE_URL"],\n  "complexity": "simple|moderate|complex",\n  "estimatedMinutes": 5\n}`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Atlas could not generate spec')
  return JSON.parse(match[0]) as BuildSpec
}
