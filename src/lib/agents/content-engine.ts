import { slack } from '../slack'
/**
 * Content Engine — automated faceless YouTube scripts + ebook generation
 * Two channels: Card Chiefz (hobby content) + ResumeChiefz (career content)
 * Scripts → ElevenLabs narration → ready to upload
 * Ebooks → PDF → sell on Gumroad or KDP
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'
import { getAuthenticatedClient } from '../google/auth'
import { google } from 'googleapis'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const TOKEN = process.env.SLACK_BOT_TOKEN
const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY


// High-search, low-competition topics for each channel
const YOUTUBE_TOPICS = {
  cardchiefz: [
    'Top 5 rookie cards to buy before they spike',
    'Is this card worth grading? PSA vs raw',
    'Card market weekly update — what moved this week',
    'Best cards under $20 with upside right now',
    'How to spot undervalued cards on eBay',
    'When to sell vs hold — the card investor mindset',
  ],
  resumechiefz: [
    'Why your resume gets rejected in 6 seconds',
    'ATS resume tips no one talks about',
    'The resume format that gets callbacks in 2026',
    'How recruiters actually read your resume',
    'Top 5 resume mistakes costing you interviews',
    'How to quantify your resume bullets if you have no numbers',
  ],
}

const EBOOK_TOPICS = {
  cardchiefz: [
    'The Complete Guide to Sports Card Investing in 2026',
    'PSA Grading: When It Pays and When It Doesn\'t',
    'How to Build a Profitable eBay Card Store from Scratch',
  ],
  resumechiefz: [
    'The ATS-Proof Resume: A Recruiter\'s Complete Playbook',
    'Land Your First Job in 30 Days: The Modern Job Search System',
    'From Layoff to Hired: The 90-Day Career Recovery Plan',
  ],
}

export async function generateYouTubeScript(channel: 'cardchiefz' | 'resumechiefz', topic?: string): Promise<{ title: string; script: string; description: string; tags: string[] }> {
  // Use content intelligence to pick a fresh, non-repetitive, viral topic
  let selectedTopic = topic
  if (!selectedTopic) {
    try {
      const { pickFreshTopic } = await import('./content-intel')
      selectedTopic = await pickFreshTopic(channel, 'youtube')
    } catch {
      const topics = YOUTUBE_TOPICS[channel]
      selectedTopic = topics[Math.floor(Math.random() * topics.length)]
    }
  }

  const channelVoice = channel === 'cardchiefz'
    ? 'Real card collector and eBay seller. Casual, knowledgeable, community-native. Sounds like the most trusted person at the card show.'
    : 'Real recruiter from Charlotte NC. Direct, practical, no corporate speak. Sounds like insider advice, not a YouTube channel.'

  // ── Research brief: what's actually trending RIGHT NOW ──────────────────────
  let researchContext = ''
  try {
    const { research } = await import('../research')
    const niche = channel === 'cardchiefz' ? 'sports card collecting and investing' : 'resume building and job search'
    const [contentResearch, brandResearch] = await Promise.allSettled([
      research.forContent(niche, channel === 'cardchiefz' ? 'Card Chiefz' : 'ResumeChiefz'),
      research.forBrand(niche),
    ])

    if (contentResearch.status === 'fulfilled') {
      const brief = contentResearch.value
      researchContext = `
LIVE RESEARCH BRIEF (verified signals from ${brief.sources.slice(0, 3).join(', ')}):
Confidence: ${brief.confidence}
Trending now: ${brief.trendingNow.slice(0, 3).join(' | ') || 'insufficient data'}
Synthesized insight: ${brief.synthesizedInsight.slice(0, 400)}

Use this intelligence to make the content feel current and relevant.
If the research doesn't support a claim, don't make it.`
    }
  } catch { /* research unavailable — proceed without */ }

  const msg = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `Write a faceless YouTube script for ${channel === 'cardchiefz' ? 'Card Chiefz' : 'ResumeChiefz'}.

VOICE: ${channelVoice}

TOPIC: "${selectedTopic}"
${researchContext}

━━━ VIRAL CONTENT RULES (non-negotiable) ━━━

HOOK (first 15 seconds — make or break):
- Open mid-thought. Drop them into the most interesting moment.
- The viewer should feel like they almost scrolled past something they needed.
- Pattern interrupt: a number, a counterintuitive claim, a specific result, or a mystery.
- NEVER: "In this video...", "Hey guys...", "Today we're going to..."

STRUCTURE that retains viewers:
- Tease the payoff in the first 20 seconds, deliver it in the last 30
- New insight or example every 60-90 seconds — no dead air
- Pattern: claim → proof/example → so what → next claim
- Use "here's the thing most people get wrong about X" transitions

CONTENT PHILOSOPHY:
- Be genuinely useful. If a viewer screenshots this or shares it, that's the goal.
- Specific beats vague. "47% of resumes" beats "many resumes". Real examples beat theory.
- If it's counterintuitive, say it like a secret. If it's obvious to pros, say it like insider info.
- NEVER sell the product. Never mention the channel. Just teach.

FORMAT: Faceless — voice over text/visuals. 5-7 min (750-900 words).

Return JSON only:
{
  "title": "SEO-optimized, keyword-first, curiosity hook — under 60 chars",
  "script": "complete word-for-word script",
  "description": "YouTube description — first sentence is a hook, 150 words, keyword-rich, ends with call to action",
  "tags": ["10 specific searchable tags"],
  "hook": "first 2 sentences only — the make-or-break opener"
}`,
    }],
  })

  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const match = text.match(/\{[\s\S]*\}/)
    return match ? JSON.parse(match[0]) : { title: selectedTopic, script: '', description: '', tags: [] }
  } catch {
    return { title: selectedTopic, script: '', description: '', tags: [] }
  }
}

export interface EbookPackage {
  title: string
  subtitle: string
  content: string
  wordCount: number
  // KDP-ready metadata — paste directly into publisher.amazon.com
  kdp: {
    title: string
    subtitle: string
    author: string
    description: string           // 4000 char max, HTML supported
    keywords: string[]            // 7 keywords for discoverability
    categories: string[]          // 2 BISAC categories
    suggestedPrice: number        // $2.99-$9.99 = 70% royalty
    targetAudience: string
    publishingNotes: string       // What to do step by step
  }
}

export async function generateEbook(channel: 'cardchiefz' | 'resumechiefz', topic?: string): Promise<EbookPackage> {
  const topics = EBOOK_TOPICS[channel]
  const selectedTopic = topic ?? topics[Math.floor(Math.random() * topics.length)]

  const authorName = 'Anthony Bowles'
  const brandName = channel === 'cardchiefz' ? 'Card Chiefz' : 'ResumeChiefz'

  const msg = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `You are writing a Kindle ebook for ${brandName}.

Author: ${authorName}
${channel === 'cardchiefz'
  ? 'Anthony is an eBay card seller with 1400+ sales and 99.5% feedback. He knows the hobby from the inside — what moves, what doesn\'t, what collectors get wrong, what actually makes money.'
  : 'Anthony is a recruiter with 10+ years of experience. He\'s read thousands of resumes and knows exactly why people don\'t get callbacks. He\'s also the founder of an AI resume builder.'}

Topic suggestion to consider (use it or pick something better based on what would actually help the most people right now): "${selectedTopic}"

VOICE — this is everything:
Write like a smart person talking to a friend over coffee. Casual but knows their stuff. Never stiff. Never corporate. Not trying to sound like a book — trying to sound like the most useful conversation someone could have on this topic. Contractions, real talk, the occasional opinion. If something is genuinely hard, say so. If something is simple, say it plainly.

ACCURACY — non-negotiable:
Only include what you actually know to be true. No filler stats. No made-up numbers. If something is a general principle say it that way. Never invent specifics to sound credible — real credibility comes from being honest about what you know and don't know.

LENGTH AND STRUCTURE:
3,500-4,500 words. Chapters should feel like natural progressions, not a table of contents someone generated. The intro should make someone think "finally someone said this." The conclusion should leave them with one clear next move, not a summary of everything they just read.

NO:
- "In today's fast-paced world..."
- "In conclusion..."
- Robotic numbered frameworks that don't feel earned
- Anything that sounds like it was written by a content farm
- Made up statistics or fake quotes

Return JSON: {
  "title": "best title you can write",
  "subtitle": "benefit-focused, under 200 chars",
  "content": "full ebook — write the whole thing, every chapter",
  "wordCount": number,
  "kdp": {
    "title": "same title",
    "subtitle": "same subtitle",
    "author": "${authorName}",
    "description": "Amazon listing description, 250-400 words, HTML with p and b tags, first sentence hooks them",
    "keywords": ["7 long-tail keywords buyers actually search"],
    "categories": ["BISAC category 1", "BISAC category 2"],
    "suggestedPrice": 6.99,
    "targetAudience": "who this is for",
    "publishingNotes": "step by step: what to do on kdp.amazon.com to publish this"
  }
}`,
    }],
  })

  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const match = text.match(/\{[\s\S]*\}/)
    const data = match ? JSON.parse(match[0]) : {}
    return {
      title: data.title ?? selectedTopic,
      subtitle: data.subtitle ?? '',
      content: data.content ?? '',
      wordCount: data.wordCount ?? 0,
      kdp: data.kdp ?? {},
    }
  } catch {
    return { title: selectedTopic, subtitle: '', content: '', wordCount: 0, kdp: {} as EbookPackage['kdp'] }
  }
}

// Generate narration audio for a script using ElevenLabs
export async function generateNarration(script: string, voiceId: string): Promise<Buffer | null> {
  if (!ELEVENLABS_KEY) return null
  const clean = script.replace(/\[.*?\]/g, '').replace(/\*\*/g, '').trim()

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text: clean.slice(0, 4000),
      model_id: 'eleven_turbo_v2_5',
      voice_settings: { stability: 0.6, similarity_boost: 0.8, style: 0.3 },
    }),
  })

  if (!res.ok) return null
  const buffer = await res.arrayBuffer()
  return Buffer.from(buffer)
}

// Save script to Drive and post to Slack
export async function runContentPipeline(channel: 'cardchiefz' | 'resumechiefz', type: 'youtube' | 'ebook'): Promise<void> {
  if (type === 'youtube') {
    const script = await generateYouTubeScript(channel)

    // Save to Drive
    const auth = await getAuthenticatedClient()
    if (auth) {
      const drive = google.drive({ version: 'v3', auth })
      const docs = google.docs({ version: 'v1', auth })
      const doc = await docs.documents.create({ requestBody: { title: script.title } })
      const docId = doc.data.documentId!
      await docs.documents.batchUpdate({
        documentId: docId,
        requestBody: { requests: [{ insertText: { location: { index: 1 }, text: `${script.title}\n\n${script.script}\n\n---\nDESCRIPTION:\n${script.description}\n\nTAGS: ${script.tags.join(', ')}` } }] },
      })

      const folderName = channel === 'cardchiefz' ? 'Card Chiefz YouTube' : 'ResumeChiefz YouTube'
      const { data: folders } = await drive.files.list({ q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`, fields: 'files(id)' })
      let folderId = folders?.files?.[0]?.id ?? ''
      if (!folderId) {
        const f = await drive.files.create({ requestBody: { name: folderName, mimeType: 'application/vnd.google-apps.folder' }, fields: 'id' })
        folderId = f.data.id ?? ''
      }
      if (folderId) await drive.files.update({ fileId: docId, addParents: folderId, requestBody: {} })

      await slack(`🎬 *New YouTube Script — ${channel === 'cardchiefz' ? 'Card Chiefz' : 'ResumeChiefz'}*

*Title:* ${script.title}
*Script:* ~${Math.round(script.script.split(' ').length)} words (~${Math.round(script.script.split(' ').length / 130)} min)
*Saved to Drive:* ${folderName}

_React ✅ to approve for recording, or reply with edits_`)
    }

    // Save draft to Supabase
    const { data: draft } = await supabaseAdmin.from('ai_memories').insert({
      category: 'youtube_draft',
      content: script.title,
      context: JSON.stringify({ channel, ...script, status: 'pending' }),
      importance: 7,
      created_at: new Date().toISOString(),
    }).select('id').single()

    const draftId = draft?.id ?? ''
    const reviewUrl = `http://localhost:3001/review/youtube/${draftId}`
    const mobileUrl = `https://jarvis-os-dusky.vercel.app/review/youtube/${draftId}`

    // Slack notification with review links
    await slack(`🎬 *YouTube Script Ready — ${channel === 'cardchiefz' ? 'Card Chiefz' : 'ResumeChiefz'}*

*Title:* ${script.title}
*Length:* ~${Math.round(script.script.split(' ').length / 130)} min

Review the script and approve to post:
• Mac: ${reviewUrl}
• Mobile: ${mobileUrl}`)

    // Auto-open review screen on Mac (only when running locally)
    if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
      const { exec } = await import('child_process')
      exec(`open -a "Google Chrome" "${reviewUrl}"`)
    }
  }

  if (type === 'ebook') {
    const ebook = await generateEbook(channel)

    const auth = await getAuthenticatedClient()
    if (auth) {
      const docs = google.docs({ version: 'v1', auth })
      const drive = google.drive({ version: 'v3', auth })

      // Main manuscript doc
      const doc = await docs.documents.create({ requestBody: { title: ebook.title } })
      const docId = doc.data.documentId!
      await docs.documents.batchUpdate({
        documentId: docId,
        requestBody: { requests: [{ insertText: { location: { index: 1 }, text: ebook.content } }] },
      })

      // KDP metadata doc — paste directly into publisher.amazon.com
      const kdp = ebook.kdp
      const metadataText = [
        `KDP PUBLISH CHECKLIST — ${ebook.title}`,
        `Generated by Jarvis | ${new Date().toLocaleDateString()}`,
        '',
        '━━━ STEP 1: Go to kdp.amazon.com → Add New Title → Kindle eBook ━━━',
        '',
        `TITLE: ${kdp.title}`,
        `SUBTITLE: ${kdp.subtitle}`,
        `AUTHOR: ${kdp.author}`,
        '',
        '━━━ STEP 2: Book Description (paste this into the description field) ━━━',
        '',
        kdp.description,
        '',
        '━━━ STEP 3: Keywords (enter each one in its own field) ━━━',
        '',
        ...(kdp.keywords ?? []).map((k: string, i: number) => `Keyword ${i + 1}: ${k}`),
        '',
        '━━━ STEP 4: Categories ━━━',
        '',
        ...(kdp.categories ?? []).map((c: string, i: number) => `Category ${i + 1}: ${c}`),
        '',
        '━━━ STEP 5: Pricing ━━━',
        '',
        `Suggested price: $${kdp.suggestedPrice} (70% royalty = $${((kdp.suggestedPrice ?? 6.99) * 0.70).toFixed(2)} per sale)`,
        '',
        '━━━ STEP 6: Upload Manuscript ━━━',
        '',
        '1. Download this Google Doc as .docx (File → Download → Microsoft Word)',
        '2. Upload the .docx file to KDP',
        '3. Preview it in KDP\'s previewer',
        '4. If it looks good, publish',
        '',
        '━━━ NOTES ━━━',
        '',
        kdp.publishingNotes ?? '',
        '',
        `Target audience: ${kdp.targetAudience}`,
      ].join('\n')

      const metadataDoc = await docs.documents.create({ requestBody: { title: `KDP Checklist — ${ebook.title}` } })
      const metaDocId = metadataDoc.data.documentId!
      await docs.documents.batchUpdate({
        documentId: metaDocId,
        requestBody: { requests: [{ insertText: { location: { index: 1 }, text: metadataText } }] },
      })

      // Save both to Jarvis Ebooks folder
      const folderName = 'Jarvis Ebooks'
      const { data: folders } = await drive.files.list({ q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`, fields: 'files(id)' })
      let folderId = folders?.files?.[0]?.id ?? ''
      if (!folderId) {
        const f = await drive.files.create({ requestBody: { name: folderName, mimeType: 'application/vnd.google-apps.folder' }, fields: 'id' })
        folderId = f.data.id ?? ''
      }
      if (folderId) {
        await drive.files.update({ fileId: docId, addParents: folderId, requestBody: {} })
        await drive.files.update({ fileId: metaDocId, addParents: folderId, requestBody: {} })
      }

      const royaltyPerSale = ((kdp.suggestedPrice ?? 6.99) * 0.70).toFixed(2)

      await slack(`📚 *New Ebook Ready to Publish — ${channel === 'cardchiefz' ? 'Card Chiefz' : 'ResumeChiefz'}*

*"${ebook.title}"*
_${ebook.subtitle}_

*${ebook.wordCount.toLocaleString()} words* | Price: $${kdp.suggestedPrice} | Royalty: $${royaltyPerSale}/sale

Two docs saved to Drive → *Jarvis Ebooks* folder:
1. 📄 Manuscript — download as .docx, upload to KDP
2. 📋 KDP Checklist — title, description, keywords, categories all ready to paste

*To publish:*
1. Open the checklist doc in Drive
2. Go to kdp.amazon.com → Add New Title
3. Follow the checklist step by step
4. Takes about 10 minutes

_React ✅ when published so I can track it_`)
    }

    await supabaseAdmin.from('ai_memories').insert({
      category: 'ebook_draft',
      content: ebook.title,
      context: JSON.stringify({ channel, title: ebook.title, subtitle: ebook.subtitle, wordCount: ebook.wordCount, kdp: ebook.kdp }),
      importance: 8,
      created_at: new Date().toISOString(),
    })
  }
}
