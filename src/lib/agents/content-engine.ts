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

async function slack(text: string) {
  if (!TOKEN) return
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: '#jarvis', text }),
  })
}

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
  const topics = YOUTUBE_TOPICS[channel]
  const selectedTopic = topic ?? topics[Math.floor(Math.random() * topics.length)]

  const channelVoice = channel === 'cardchiefz'
    ? 'Real card collector and eBay seller. Casual, knowledgeable, community-native. Sounds like the most trusted person at the card show.'
    : 'Real recruiter from Charlotte NC. Direct, practical, no corporate speak. Sounds like insider advice, not a YouTube channel.'

  const msg = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `Write a faceless YouTube script for this topic: "${selectedTopic}"

Channel: ${channel === 'cardchiefz' ? 'Card Chiefz' : 'ResumeChiefz'}
Voice: ${channelVoice}
Format: Faceless — no on-camera presenter. Voice narration over visuals/text cards.
Length: 5-7 minutes (700-900 words spoken)

Script requirements:
- Strong hook in first 15 seconds (the thing people are already wondering)
- No filler phrases ("In this video I'll show you...")
- Actionable throughout — every 90 seconds something they can do
- Ends with one strong CTA (check out Card Chiefz or try ResumeChiefz free)
- No "smash that subscribe button" energy

Also provide:
- SEO-optimized title (include keyword)
- YouTube description (150 words, keyword-rich)
- 10 relevant tags

Return JSON: {"title": "...", "script": "full script text", "description": "...", "tags": ["..."]}`,
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

export async function generateEbook(channel: 'cardchiefz' | 'resumechiefz', topic?: string): Promise<{ title: string; content: string; wordCount: number }> {
  const topics = EBOOK_TOPICS[channel]
  const selectedTopic = topic ?? topics[Math.floor(Math.random() * topics.length)]

  const msg = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `Write a comprehensive ebook: "${selectedTopic}"

Channel: ${channel === 'cardchiefz' ? 'Card Chiefz by Anthony Bowles' : 'ResumeChiefz by Anthony Bowles, Recruiter'}
Tone: Expert but accessible. Real experience behind every word. Not generic.
Length: 3,000-4,000 words
Format: Chapters with clear headers, actionable frameworks, real examples

Structure:
- Intro: Why this matters and who this is for
- 4-6 main chapters with actionable content
- Conclusion with next steps
- Brief about the author/brand

This ebook will be sold on Gumroad for $9-19. It needs to genuinely deliver value — not feel like a content farm product.

Return JSON: {"title": "...", "content": "full ebook text with chapter headers", "wordCount": approx_number}`,
    }],
  })

  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const match = text.match(/\{[\s\S]*\}/)
    return match ? JSON.parse(match[0]) : { title: selectedTopic, content: '', wordCount: 0 }
  } catch {
    return { title: selectedTopic, content: '', wordCount: 0 }
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

    await supabaseAdmin.from('ai_memories').insert({
      category: 'youtube_script',
      content: script.title,
      context: JSON.stringify({ channel, ...script }),
      importance: 7,
      created_at: new Date().toISOString(),
    })
  }

  if (type === 'ebook') {
    const ebook = await generateEbook(channel)

    const auth = await getAuthenticatedClient()
    if (auth) {
      const docs = google.docs({ version: 'v1', auth })
      const drive = google.drive({ version: 'v3', auth })
      const doc = await docs.documents.create({ requestBody: { title: ebook.title } })
      const docId = doc.data.documentId!
      await docs.documents.batchUpdate({
        documentId: docId,
        requestBody: { requests: [{ insertText: { location: { index: 1 }, text: ebook.content } }] },
      })

      const folderName = 'Jarvis Ebooks'
      const { data: folders } = await drive.files.list({ q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`, fields: 'files(id)' })
      let folderId = folders?.files?.[0]?.id ?? ''
      if (!folderId) {
        const f = await drive.files.create({ requestBody: { name: folderName, mimeType: 'application/vnd.google-apps.folder' }, fields: 'id' })
        folderId = f.data.id ?? ''
      }
      if (folderId) await drive.files.update({ fileId: docId, addParents: folderId, requestBody: {} })

      await slack(`📚 *New Ebook Generated — ${channel === 'cardchiefz' ? 'Card Chiefz' : 'ResumeChiefz'}*

*Title:* ${ebook.title}
*Word count:* ~${ebook.wordCount.toLocaleString()} words
*Saved to Drive:* Jarvis Ebooks folder

_Suggested price: $9-19 on Gumroad or Amazon KDP_
_React ✅ to approve for publishing_`)
    }

    await supabaseAdmin.from('ai_memories').insert({
      category: 'ebook_draft',
      content: ebook.title,
      context: JSON.stringify({ channel, title: ebook.title, wordCount: ebook.wordCount }),
      importance: 8,
      created_at: new Date().toISOString(),
    })
  }
}
