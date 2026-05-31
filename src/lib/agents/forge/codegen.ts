/**
 * FORGE Code Generator — Builds each file using Claude
 * Uses prompt caching for the system context (massive token savings)
 * Model routing: Haiku for boilerplate, Sonnet for logic, cached system
 */

import Anthropic from '@anthropic-ai/sdk'
import type { BuildSpec } from './spec'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const FORGE_SYSTEM = `You are FORGE — elite full-stack engineer. You write production-quality code that actually works.

Standards:
- Next.js 15 App Router, TypeScript strict, Tailwind CSS
- No placeholder comments like "// add logic here" — write real, working code
- No TODO or FIXME — ship complete implementations
- Mobile-first responsive design
- Error handling at system boundaries only (user input, external APIs)
- Dark theme by default: background #0a0f1e, accent #00d4ff, text white
- Clean, minimal UI — no over-engineering
- Supabase client: use @supabase/supabase-js with service role for server, anon for client
- Never use 'any' type — be precise
- Import paths use @/ alias

When generating a file:
1. Write the complete file — no ellipsis, no truncation
2. Include all imports
3. Handle loading and error states in UI components
4. Make it deployable with zero changes

Return ONLY the raw file content — no markdown code blocks, no explanation, just the code.`

export async function generateFile(
  spec: BuildSpec,
  file: BuildSpec['files'][0],
  alreadyBuilt: Array<{ path: string; content: string }>,
): Promise<string> {
  // Use Haiku for simple files (configs, layouts), Sonnet for logic
  const isComplex = file.priority === 'core' &&
    (file.path.includes('api') || file.path.includes('lib') || file.description.toLowerCase().includes('logic'))
  const model = isComplex ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001'

  const context = alreadyBuilt.length > 0
    ? `\n\nAlready built files (for reference):\n${alreadyBuilt.slice(-3).map(f => `// ${f.path}\n${f.content.slice(0, 800)}`).join('\n\n')}`
    : ''

  const response = await anthropic.messages.create({
    model,
    max_tokens: 4000,
    system: [
      { type: 'text', text: FORGE_SYSTEM, cache_control: { type: 'ephemeral' } }
    ] as Parameters<typeof anthropic.messages.create>[0]['system'],
    messages: [{
      role: 'user',
      content: `Project: ${spec.title}
Tech stack: ${spec.techStack}
Description: ${spec.description}
MVP features: ${spec.mvpFeatures.join(', ')}
Env vars available: ${(spec.envVars ?? []).join(', ')}${context}

Generate file: ${file.path}
Purpose: ${file.description}

Write the complete file. No markdown. No truncation. Real working code only.`,
    }],
  })

  return response.content[0].type === 'text' ? response.content[0].text : ''
}

export async function generatePackageJson(spec: BuildSpec): Promise<string> {
  return JSON.stringify({
    name: spec.name,
    version: '0.1.0',
    private: true,
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
      lint: 'next lint',
    },
    dependencies: {
      next: '^15.0.0',
      react: '^19.0.0',
      'react-dom': '^19.0.0',
      ...(spec.techStack.includes('Supabase') ? { '@supabase/supabase-js': '^2.0.0' } : {}),
      ...(spec.techStack.includes('Stripe') ? { stripe: '^16.0.0' } : {}),
    },
    devDependencies: {
      typescript: '^5',
      '@types/node': '^20',
      '@types/react': '^19',
      '@types/react-dom': '^19',
      tailwindcss: '^4',
      eslint: '^9',
      'eslint-config-next': '15.0.0',
    },
  }, null, 2)
}
