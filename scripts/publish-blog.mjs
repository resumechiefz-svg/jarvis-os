#!/usr/bin/env node
/**
 * publish-blog.mjs — standalone blog publisher
 * Called by autoblog.ts via exec() — runs outside Next.js bundling
 *
 * Usage: node scripts/publish-blog.mjs '<json>'
 * JSON: { title, slug, excerpt, tag, content }
 */

import fs from 'fs/promises'
import path from 'path'
import { execSync } from 'child_process'

const HOME = process.env.HOME ?? '/Users/anthonyb23xx'
const RC_DIR = path.join(HOME, 'Desktop/resumechiefz')
const BLOG_DIR = path.join(RC_DIR, 'public/blog')
const BLOG_INDEX = path.join(RC_DIR, 'public/blog.html')

const post = JSON.parse(process.argv[2])
const today = new Date()
const dateStr = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const dateSuffix = today.toISOString().slice(0, 10)
const filename = `${post.slug}-${dateSuffix}.html`
const filepath = path.join(BLOG_DIR, filename)
const url = `/blog/${filename}`

const html = `<!DOCTYPE html>
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
        footer { background-color: #0a1628; color: rgba(255,255,255,0.6); padding: 2rem 1rem; text-align: center; font-size: 0.85rem; }
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

        <!-- Email capture — ATS checklist lead magnet -->
        <div id="email-capture" style="margin-top:40px;background:#0a1628;border:1px solid rgba(201,168,76,0.25);border-radius:12px;padding:36px 32px;text-align:center;">
            <p style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#c9a84c;margin-bottom:12px;">Free Download</p>
            <h3 style="font-size:22px;font-weight:800;color:#fff;margin-bottom:10px;line-height:1.3;">The ATS Resume Checklist</h3>
            <p style="font-size:15px;color:rgba(255,255,255,0.55);margin-bottom:24px;max-width:400px;margin-left:auto;margin-right:auto;">10 things recruiters check in 6 seconds. Fix these before submitting anywhere.</p>
            <form id="capture-form" onsubmit="submitCapture(event)" style="display:flex;flex-direction:column;gap:12px;max-width:400px;margin:0 auto;">
                <input type="text" id="cap-name" placeholder="First name" required
                    style="padding:12px 16px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:15px;outline:none;font-family:inherit;">
                <input type="email" id="cap-email" placeholder="Your email" required
                    style="padding:12px 16px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:15px;outline:none;font-family:inherit;">
                <button type="submit"
                    style="background:#c9a84c;color:#0a1628;font-size:15px;font-weight:700;padding:14px 24px;border-radius:8px;border:none;cursor:pointer;font-family:inherit;">
                    Send Me the Checklist →
                </button>
            </form>
            <p id="capture-msg" style="display:none;font-size:15px;color:#00ff88;margin-top:16px;font-weight:600;">✓ Check your inbox — it's on its way.</p>
            <p style="font-size:12px;color:rgba(255,255,255,0.2);margin-top:14px;">No spam. Unsubscribe anytime.</p>
        </div>
    </div>
    <footer>
        <p>&copy; 2026 ResumeChiefz. Built by a recruiting expert, for job seekers. | <a href="/blog.html">Blog</a> | <a href="/app.html">Build Your Resume</a> | <a href="/pricing.html" style="color:#c9a84c;">Pricing</a></p>
    </footer>

    <script>
    async function submitCapture(e) {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        btn.textContent = 'Sending...';
        btn.disabled = true;
        try {
            const res = await fetch('https://jarvis-os-dusky.vercel.app/api/rc/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: document.getElementById('cap-name').value,
                    email: document.getElementById('cap-email').value,
                    source: 'blog-' + window.location.pathname.split('/').pop().replace('.html',''),
                }),
            });
            if (res.ok) {
                document.getElementById('capture-form').style.display = 'none';
                document.getElementById('capture-msg').style.display = 'block';
            } else { throw new Error(); }
        } catch {
            btn.textContent = 'Try again';
            btn.disabled = false;
        }
    }
    </script>
</body>
</html>`

// Write the post HTML
await fs.writeFile(filepath, html, 'utf-8')

// Prepend card to blog index
const indexHtml = await fs.readFile(BLOG_INDEX, 'utf-8')
const card = `
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

const updated = indexHtml.replace('<div class="blog-grid">', `<div class="blog-grid">${card}`)
await fs.writeFile(BLOG_INDEX, updated, 'utf-8')

// Git commit + Vercel deploy
try {
  execSync(
    `cd "${RC_DIR}" && rm -f .git/index.lock 2>/dev/null; git add public/blog/ public/blog.html && git commit -m "Blog: ${post.title.slice(0, 60)} - ${dateSuffix}" && vercel --prod --yes`,
    { timeout: 120000, stdio: 'pipe' }
  )
} catch(e) {
  // Deploy error is non-fatal — file is written, just log it
  process.stderr.write(`Deploy error: ${e.message}\n`)
}

// Output result for caller to parse
console.log(JSON.stringify({ url, liveUrl: `https://resumechiefz.com${url}`, filename }))
