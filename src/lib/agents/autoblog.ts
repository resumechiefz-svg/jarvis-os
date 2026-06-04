/**
 * Auto-Blog Pipeline — ECHO writes, publishes, and goes live automatically
 *
 * Flow:
 * 1. Pull trending Reddit topics for inspiration
 * 2. Claude writes the post (title, slug, content, excerpt, tag)
 * 3. Render full HTML using the site's exact template
 * 4. Write HTML file to ~/Desktop/resumechiefz/public/blog/
 * 5. Prepend blog card to blog.html index
 * 6. git add + commit + vercel --prod deploy
 * 7. Slack the real live URL
 */
import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs/promises'
import * as path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'
import { slack } from '../slack'

const execAsync = promisify(exec)
const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function getPaths() {
  const home = process.env.HOME ?? '/Users/anthonyb23xx'
  const RC_DIR = path.join(home, 'Desktop/resumechiefz')
  return {
    RC_DIR,
    BLOG_DIR: path.join(RC_DIR, 'public/blog'),
    BLOG_INDEX: path.join(RC_DIR, 'public/blog.html'),
  }
}

// ── 1. Trending topics from Reddit ───────────────────────────────────────────
async function getTrendingTopics(brand: 'rc' | 'cc'): Promise<string[]> {
  const subs = brand === 'rc'
    ? ['resumes', 'jobs', 'cscareerquestions', 'careerguidance']
    : ['basketballcards', 'footballcards', 'baseballcards', 'sportscards']

  const topics: string[] = []
  for (const sub of subs.slice(0, 2)) {
    try {
      const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=5`, {
        headers: { 'User-Agent': 'JarvisOS/1.0 blog-research' }
      })
      const data = await res.json() as { data?: { children?: Array<{ data: { title: string } }> } }
      data?.data?.children?.forEach(c => topics.push(c.data.title))
    } catch { /* skip */ }
  }
  return topics.slice(0, 6)
}

// ── 2. Claude writes the post ─────────────────────────────────────────────────
async function writeBlogPost(brand: 'rc' | 'cc', topics: string[]): Promise<{
  title: string; slug: string; content: string; excerpt: string; tag: string
}> {
  const brandCtx = brand === 'rc'
    ? 'ResumeChiefz — AI resume builder built by a 10-year recruiter. Target: job seekers who want a competitive edge.'
    : 'Card Chiefz — premium sports card eBay store. 1,400+ sales, 99.5% feedback. Target: collectors and investors.'

  const msg = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    messages: [{
      role: 'user',
      content: `Write a blog post for ${brandCtx}

Trending topics for inspiration:
${topics.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Pick the most SEO-valuable angle. Write a complete blog post:
- Title: specific, SEO-optimized, curiosity-driving (no clickbait)
- Excerpt: 1-2 sentences that hook the reader
- Tag: one of: MARKET, GUIDE, TIPS, GRADING, STRATEGY, CAREER
- Slug: url-friendly, no date (date is appended automatically)
- Content: 600-800 words of HTML (use <h2>, <p>, <ul><li>, <strong> — no <html>/<head>/<body> tags)
  - Genuinely valuable, practical, specific
  - End with a soft CTA paragraph linking to ${brand === 'rc' ? '/app.html' : 'https://www.ebay.com/str/cardchiefz'}

Return JSON only:
{
  "title": "...",
  "slug": "url-friendly-slug-no-date",
  "excerpt": "...",
  "tag": "...",
  "content": "<h2>...</h2><p>...</p>..."
}`,
    }],
  })

  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    // Strip markdown code fences if present
    const stripped = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    // Find the outermost JSON object
    const start = stripped.indexOf('{')
    const end = stripped.lastIndexOf('}')
    if (start === -1 || end === -1) throw new Error('No JSON found')
    const parsed = JSON.parse(stripped.slice(start, end + 1))
    if (!parsed.title || !parsed.slug) throw new Error('Missing required fields')
    return parsed
  } catch {
    return { title: 'Draft post', slug: 'draft', content: '', excerpt: '', tag: 'GUIDE' }
  }
}

// ── 3–6. Write, update index, git commit, deploy — via standalone script ─────
// Runs outside Next.js bundling to avoid Turbopack module caching issues
async function publishAndDeploy(post: { title: string; slug: string; excerpt: string; tag: string; content: string }): Promise<string> {
  const scriptPath = path.join(process.cwd(), 'scripts/publish-blog.mjs')
  const json = JSON.stringify(post).replace(/'/g, "\\'")
  const { stdout, stderr } = await execAsync(`node "${scriptPath}" '${json}'`, { timeout: 120000 })
  if (stderr && !stderr.includes('Deploy error')) throw new Error(stderr)
  const result = JSON.parse(stdout.trim())
  return result.liveUrl
}

// ── Legacy HTML renderer (kept for reference) ─────────────────────────────────
function renderHTML(post: { title: string; excerpt: string; tag: string; content: string }, dateStr: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${post.title} | ResumeChiefz</title>
    <meta name="description" content="${post.excerpt}">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif; background-color: #0a1628; color: #333; line-height: 1.6; }
        header { background-color: #0a1628; color: white; padding: 2rem 1rem; text-align: center; border-bottom: 3px solid #c9a84c; }
        header h1 { font-size: 2rem; margin-bottom: 0.5rem; color: #c9a84c; }
        header p { font-size: 0.9rem; opacity: 0.9; }
        nav { background-color: #0f1f34; padding: 1rem; text-align: center; border-bottom: 1px solid #c9a84c; }
        nav a { color: #c9a84c; text-decoration: none; margin: 0 1.5rem; font-weight: 500; font-size: 0.9rem; }
        nav a:hover { text-decoration: underline; }
        .container { max-width: 800px; margin: 0 auto; padding: 3rem 1.5rem; background-color: white; }
        .meta { color: #666; font-size: 0.9rem; margin-bottom: 2rem; font-style: italic; }
        h1 { font-size: 2rem; color: #0a1628; margin-bottom: 1.5rem; line-height: 1.3; }
        h2 { font-size: 1.4rem; color: #0a1628; margin: 2rem 0 1rem; }
        p { margin-bottom: 1.2rem; color: #444; }
        ul, ol { margin: 1rem 0 1.5rem 1.5rem; }
        li { margin-bottom: 0.5rem; color: #444; }
        strong { color: #0a1628; }
        a { color: #c9a84c; }
        .cta-box { background: linear-gradient(135deg, #0a1628 0%, #0d1f3a 100%); border-radius: 8px; padding: 2rem; text-align: center; margin-top: 3rem; }
        .cta-box p { color: white; margin-bottom: 1rem; font-size: 1.1rem; }
        .cta-button { background-color: #c9a84c; color: #0a1628; padding: 0.8rem 2rem; border-radius: 4px; text-decoration: none; font-weight: 700; font-size: 1rem; display: inline-block; }
        .cta-button:hover { background-color: #b8973b; }
        footer { background-color: #0a1628; color: rgba(255,255,255,0.6); padding: 2rem 1rem; text-align: center; font-size: 0.85rem; margin-top: 0; }
        footer a { color: #c9a84c; text-decoration: none; }
    </style>
</head>
<body>
    <header>
        <h1>ResumeChiefz</h1>
        <p>Expert resume advice from a 10-year recruiting professional</p>
    </header>
    <nav>
        <a href="/">Home</a>
        <a href="/blog.html">Blog</a>
        <a href="/app.html">Build My Resume</a>
    </nav>
    <div class="container">
        <p class="meta">${post.tag} &nbsp;·&nbsp; ${dateStr} &nbsp;·&nbsp; 5 min read</p>
        <h1>${post.title}</h1>
        ${post.content}
        <div class="cta-box">
            <p>Ready to build a resume that gets interviews? Try ResumeChiefz free — no credit card required.</p>
            <a href="/app.html" class="cta-button">Build Your Resume Free →</a>
        </div>
    </div>
    <footer>
        <p>&copy; 2026 ResumeChiefz. Built by a recruiting expert, for job seekers. | <a href="/blog.html">Blog</a> | <a href="/app.html">Build Your Resume</a></p>
    </footer>
</body>
</html>`
}

// ── 4+5. Write file and prepend card to blog index ────────────────────────────
async function publishToSite(post: { title: string; slug: string; excerpt: string; tag: string; content: string }): Promise<string> {
  const { BLOG_DIR, BLOG_INDEX } = getPaths()
  const today = new Date()
  const dateStr = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const dateSuffix = today.toISOString().slice(0, 10)
  const filename = `${post.slug}-${dateSuffix}.html`
  const filepath = path.join(BLOG_DIR, filename)
  const url = `/blog/${filename}`

  await fs.writeFile(filepath, renderHTML(post, dateStr), 'utf-8')

  const indexHtml = await fs.readFile(BLOG_INDEX, 'utf-8')
  const newCard = `
            <!-- Auto-published ${dateSuffix} -->
            <div class="post-card">
                <div class="post-card-header">
                    <div>
                        <h2 class="post-card-title">${post.title}</h2>
                        <p class="post-card-excerpt">${post.excerpt}</p>
                    </div>
                </div>
                <div class="post-card-footer">
                    <span class="post-date">${dateStr}</span>
                    <a href="${url}" class="post-link">Read →</a>
                </div>
            </div>`

  const updated = indexHtml.replace(
    '<div class="blog-grid">',
    `<div class="blog-grid">${newCard}`
  )
  await fs.writeFile(BLOG_INDEX, updated, 'utf-8')

  return url
}

// ── 6. Git commit + Vercel deploy ─────────────────────────────────────────────
async function deployToVercel(title: string, dateSuffix: string): Promise<string> {
  const { RC_DIR } = getPaths()
  const { stdout } = await execAsync(
    `cd "${RC_DIR}" && \
     rm -f .git/index.lock .git/HEAD.lock 2>/dev/null; \
     git add public/blog/ public/blog.html && \
     git commit -m "Blog: ${title.slice(0, 60)} - ${dateSuffix}" && \
     vercel --prod --yes 2>&1 | tail -3`,
    { timeout: 120000 }
  )
  // Extract production URL from vercel output
  const match = stdout.match(/https:\/\/[^\s]+\.vercel\.app|https:\/\/resumechiefz\.com[^\s]*/i)
  return match ? match[0] : 'https://resumechiefz.com/blog.html'
}

// ── Generate social preview copy ──────────────────────────────────────────────
async function previewSocialCopy(post: { title: string; excerpt: string }): Promise<{
  linkedin: string; twitter: string; pinterest: string
}> {
  try {
    const resp = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 400,
      messages: [{ role: 'user', content: `Write social copy for ResumeChiefz blog post:
Title: ${post.title}
Excerpt: ${post.excerpt}
Return JSON only: {"linkedin":"150 chars + 2-3 hashtags","twitter":"under 240 chars punchy","pinterest":"100 chars tips-focused"}` }],
    })
    const text = resp.content[0].type === 'text' ? resp.content[0].text : '{}'
    const s = text.indexOf('{'), e = text.lastIndexOf('}')
    return JSON.parse(text.slice(s, e + 1))
  } catch {
    return {
      linkedin: `${post.title} — new on ResumeChiefz #resume #career #jobsearch`,
      twitter: `${post.title} → resumechiefz.com`,
      pinterest: `${post.title} — resume tips that work`,
    }
  }
}

// ── Main export — DRAFT MODE: Slack for approval before publishing ─────────────
export async function runAutoBlog(brand: 'rc' | 'cc' = 'rc'): Promise<{ title: string; slug: string; savedId: string }> {
  const topics = await getTrendingTopics(brand)
  const post = await writeBlogPost(brand, topics)
  const dateSuffix = new Date().toISOString().slice(0, 10)
  const pendingUrl = `https://resumechiefz.com/blog/${post.slug}-${dateSuffix}.html`

  // Generate social preview
  const social = await previewSocialCopy(post)

  // Save draft to Supabase (status = pending)
  const { data } = await supabaseAdmin.from('ai_memories').insert({
    category: `blog_draft_${brand}`,
    content: post.title,
    context: JSON.stringify({
      ...post,
      dateSuffix,
      brand,
      pendingUrl,
      social,
      status: 'pending',
    }),
    importance: 7,
    created_at: new Date().toISOString(),
  }).select('id').single()

  const draftId = data?.id ?? ''
  const brandName = brand === 'rc' ? 'ResumeChiefz' : 'Card Chiefz'

  // Slack the full preview — you review and react ✅ to approve or ❌ to discard
  const { slackWithTs } = await import('../slack')
  await slackWithTs(`
✍️ *ECHO — ${brandName} Blog Draft Ready for Review*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*Title:* ${post.title}
*Tag:* ${post.tag}

*Excerpt:*
${post.excerpt}

─────────────────────────────
*📌 LinkedIn copy:*
${social.linkedin}

*🐦 Twitter/X copy:*
${social.twitter}

*🖼️ Pinterest copy:*
${social.pinterest}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
React ✅ to *publish + post to all socials*
React ❌ to *discard*
_Draft ID: ${draftId}_
  `.trim(), 'echo')

  return { title: post.title, slug: post.slug, savedId: draftId }
}

// ── Called by Slack webhook when you react ✅ ─────────────────────────────────
export async function approveBlogDraft(draftId: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    // Load draft from Supabase
    const { data } = await supabaseAdmin
      .from('ai_memories')
      .select('context')
      .eq('id', draftId)
      .single()

    if (!data) return { ok: false, error: 'Draft not found' }

    const draft = JSON.parse(data.context) as {
      title: string; slug: string; excerpt: string; tag: string; content: string
      dateSuffix: string; brand: string; pendingUrl: string; social: { linkedin: string; twitter: string; pinterest: string }
    }

    // Publish to site
    let liveUrl = draft.pendingUrl
    try {
      liveUrl = await publishAndDeploy(draft)
    } catch (err) {
      console.error('Publish error:', err)
    }

    // Post to Buffer (LinkedIn, Twitter, Pinterest)
    try {
      const { postBlogToSocial } = await import('./buffer-social')
      await postBlogToSocial({ title: draft.title, excerpt: draft.excerpt, slug: draft.slug, liveUrl })
    } catch (err) {
      console.error('Buffer error:', err)
    }

    // Update Supabase status
    await supabaseAdmin.from('ai_memories').update({
      category: `blog_published_${draft.brand}`,
      context: JSON.stringify({ ...draft, liveUrl, status: 'published', publishedAt: new Date().toISOString() }),
    }).eq('id', draftId)

    // Slack confirmation
    await slack(`✅ *Published!* ${draft.title}\n${liveUrl}`, 'echo')

    return { ok: true, url: liveUrl }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
