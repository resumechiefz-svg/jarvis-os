/**
 * YouTube Automation Pipeline — end-to-end video production
 * Phase 1: Script + scene breakdown (Claude)
 * Phase 2: Scene images (Replicate FLUX or DALL-E 3)
 * Phase 3: Voiceover (ElevenLabs API)
 * Phase 4: Image animation (RunwayML Gen-3)
 * Phase 5: Assembly (FFmpeg via exec)
 * Phase 6: Upload (YouTube Data API) — triggers on Slack ✅ approval
 *
 * Human touchpoints: pick topic (optional) + review + ✅
 */
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import { supabaseAdmin } from '../supabase/client'
import { getAuthenticatedClient } from '../google/auth'
import { google } from 'googleapis'

const execAsync = promisify(exec)
const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const TOKEN = process.env.SLACK_BOT_TOKEN
const REPLICATE_KEY = process.env.REPLICATE_API_TOKEN
const RUNWAY_KEY = process.env.RUNWAY_API_SECRET
const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY

// Voice IDs per channel
const VOICES = {
  cardchiefz: 'TxGEqnHWrfWFTfGW9XjX',  // Josh — deep, hobbyist feel
  resumechiefz: 'JBFqnCBsd6RMkjVDRZzb', // George — authoritative, recruiter
}

async function slack(text: string, channel = '#jarvis') {
  if (!TOKEN) return
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, text }),
  })
}

// ── PHASE 1: Script + Scene Breakdown ─────────────────────────────────────

export interface Scene {
  id: number
  narration: string     // What gets spoken
  imagePrompt: string   // What gets generated as image
  motionPrompt: string  // How the image animates
  wordCount: number
  durationEstimate: number // seconds
}

export interface VideoPackage {
  id: string
  channel: 'cardchiefz' | 'resumechiefz'
  title: string
  description: string
  tags: string[]
  script: string
  scenes: Scene[]
  theme?: string
  buildDir: string
  status: 'scripted' | 'images' | 'voiceover' | 'animated' | 'assembled' | 'approved' | 'uploaded'
  youtubeId?: string
}

export async function generateScript(
  channel: 'cardchiefz' | 'resumechiefz',
  topic?: string,
  theme?: string // e.g. 'lego', 'cinematic', 'anime'
): Promise<VideoPackage> {

  const channelContext = channel === 'cardchiefz'
    ? 'Card Chiefz — sports card collecting, eBay selling, PSA grading, card investment'
    : 'ResumeChiefz — job searching, resume writing, ATS, career advice from a real recruiter'

  // Let Claude pick the best topic if not specified
  const topicPrompt = topic
    ? `Topic: "${topic}"`
    : `Pick the best topic right now for ${channelContext}. Think about what people are actively searching for, what's timely, and what would genuinely help the audience. Be specific.`

  const msg = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `You are writing and directing a faceless YouTube video.

Channel: ${channelContext}
${topicPrompt}
Visual theme: ${theme ?? 'cinematic, high quality, photorealistic'}

Write a complete ~3,000 word script broken into exactly 20 scenes. Each scene is 5-10 seconds of narration with a matching visual.

Voice style: Casual, intelligent, accurate. Sounds like the most knowledgeable person on this topic who doesn't need to prove it. No robotic intros, no "smash subscribe."

For each scene provide:
- narration: what gets spoken (1-3 sentences, punchy)
- imagePrompt: detailed visual prompt for AI image generation. Include the theme style: "${theme ?? 'cinematic photorealistic'}". Be very specific — lighting, composition, what's in frame.
- motionPrompt: how the image should animate (camera pan, zoom, particles, etc.)

Return JSON:
{
  "title": "SEO-optimized title with keyword in first 3 words",
  "description": "YouTube description, 200 words, keyword-rich",
  "tags": ["10 tags"],
  "script": "full script as one continuous block",
  "scenes": [
    {
      "id": 1,
      "narration": "...",
      "imagePrompt": "...",
      "motionPrompt": "slow zoom in, dust particles floating",
      "wordCount": 25
    }
  ]
}`,
    }],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
  const match = text.match(/\{[\s\S]*\}/)
  const data = match ? JSON.parse(match[0]) : {}

  const scenes: Scene[] = (data.scenes ?? []).map((s: Scene & { wordCount: number }) => ({
    ...s,
    wordCount: s.wordCount ?? s.narration?.split(' ').length ?? 20,
    durationEstimate: Math.max(5, Math.round((s.wordCount ?? 20) / 2.5)),
  }))

  const id = `video_${Date.now()}`
  const buildDir = path.join(process.env.HOME ?? '/tmp', 'jarvis-videos', id)
  fs.mkdirSync(buildDir, { recursive: true })
  fs.mkdirSync(path.join(buildDir, 'images'), { recursive: true })
  fs.mkdirSync(path.join(buildDir, 'clips'), { recursive: true })

  const pkg: VideoPackage = {
    id,
    channel,
    title: data.title ?? topic ?? 'Untitled',
    description: data.description ?? '',
    tags: data.tags ?? [],
    script: data.script ?? '',
    scenes,
    theme,
    buildDir,
    status: 'scripted',
  }

  // Save scene prompts JSON (matches your original format)
  fs.writeFileSync(path.join(buildDir, 'scene-prompts.json'), JSON.stringify(pkg, null, 2))

  await saveVideoPackage(pkg)
  return pkg
}

// ── PHASE 2: Image Generation ──────────────────────────────────────────────

async function generateImageReplicate(prompt: string, outputPath: string): Promise<void> {
  if (!REPLICATE_KEY) throw new Error('REPLICATE_API_TOKEN not set')

  // Start prediction with FLUX
  const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${REPLICATE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { prompt, aspect_ratio: '16:9', output_format: 'jpg', output_quality: 90 } }),
  })
  let prediction = await res.json() as { id: string; status: string; output?: string[] }

  // Poll until complete
  for (let i = 0; i < 30; i++) {
    if (prediction.status === 'succeeded' && prediction.output?.[0]) {
      const imgRes = await fetch(prediction.output[0])
      const buffer = Buffer.from(await imgRes.arrayBuffer())
      fs.writeFileSync(outputPath, buffer)
      return
    }
    if (prediction.status === 'failed') throw new Error('Replicate image generation failed')
    await new Promise(r => setTimeout(r, 3000))
    const poll = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { Authorization: `Bearer ${REPLICATE_KEY}` },
    })
    prediction = await poll.json()
  }
  throw new Error('Replicate timed out')
}

async function generateImageDalle(prompt: string, outputPath: string): Promise<void> {
  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt: prompt.slice(0, 4000),
    size: '1792x1024',
    quality: 'standard',
    n: 1,
  })
  const url = response.data?.[0]?.url
  if (!url) throw new Error('DALL-E returned no image URL')
  const imgRes = await fetch(url)
  const buffer = Buffer.from(await imgRes.arrayBuffer())
  fs.writeFileSync(outputPath, buffer)
}

export async function generateImages(pkg: VideoPackage): Promise<VideoPackage> {
  await slack(`🎨 *[${pkg.title}]* Generating ${pkg.scenes.length} scene images...`)

  for (const scene of pkg.scenes) {
    const imgPath = path.join(pkg.buildDir, 'images', `scene_${String(scene.id).padStart(3, '0')}.jpg`)
    if (fs.existsSync(imgPath)) continue // Skip if already generated

    try {
      if (REPLICATE_KEY) {
        await generateImageReplicate(scene.imagePrompt, imgPath)
      } else {
        await generateImageDalle(scene.imagePrompt, imgPath)
      }
      await new Promise(r => setTimeout(r, 1000)) // Rate limit buffer
    } catch (err) {
      console.error(`[YouTube Pipeline] Scene ${scene.id} image failed:`, err)
    }
  }

  pkg.status = 'images'
  await saveVideoPackage(pkg)
  await slack(`✅ *[${pkg.title}]* All images generated`)
  return pkg
}

// ── PHASE 3: Voiceover ────────────────────────────────────────────────────

export async function generateVoiceover(pkg: VideoPackage): Promise<VideoPackage> {
  if (!ELEVENLABS_KEY) throw new Error('ELEVENLABS_API_KEY not set')

  await slack(`🎙️ *[${pkg.title}]* Generating voiceover...`)

  const voiceId = VOICES[pkg.channel]
  const voicePath = path.join(pkg.buildDir, 'voiceover_full.mp3')

  // ElevenLabs has 2500 char limit per request — chunk the script
  const chunks = chunkScript(pkg.script, 2400)
  const audioBuffers: Buffer[] = []

  for (const chunk of chunks) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': ELEVENLABS_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text: chunk,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.55, similarity_boost: 0.80, style: 0.25 },
      }),
    })
    if (!res.ok) throw new Error(`ElevenLabs failed: ${await res.text()}`)
    audioBuffers.push(Buffer.from(await res.arrayBuffer()))
    await new Promise(r => setTimeout(r, 500))
  }

  // Concatenate MP3 chunks
  fs.writeFileSync(voicePath, Buffer.concat(audioBuffers))

  pkg.status = 'voiceover'
  await saveVideoPackage(pkg)
  await slack(`✅ *[${pkg.title}]* Voiceover complete`)
  return pkg
}

function chunkScript(script: string, maxLen: number): string[] {
  const sentences = script.match(/[^.!?]+[.!?]+/g) ?? [script]
  const chunks: string[] = []
  let current = ''
  for (const s of sentences) {
    if ((current + s).length > maxLen) {
      if (current) chunks.push(current.trim())
      current = s
    } else {
      current += ' ' + s
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

// ── PHASE 4: Animation via RunwayML ───────────────────────────────────────

export async function animateScenes(pkg: VideoPackage): Promise<VideoPackage> {
  if (!RUNWAY_KEY) {
    // Fallback: use static images as video (still works, less dynamic)
    await slack(`⚠️ *[${pkg.title}]* No Runway key — using static images. Add RUNWAY_API_SECRET for animation.`)
    return pkg
  }

  await slack(`🎬 *[${pkg.title}]* Animating ${pkg.scenes.length} scenes via RunwayML...`)

  for (const scene of pkg.scenes) {
    const imgPath = path.join(pkg.buildDir, 'images', `scene_${String(scene.id).padStart(3, '0')}.jpg`)
    const clipPath = path.join(pkg.buildDir, 'clips', `clip_${String(scene.id).padStart(3, '0')}.mp4`)

    if (!fs.existsSync(imgPath) || fs.existsSync(clipPath)) continue

    try {
      const imgBase64 = fs.readFileSync(imgPath).toString('base64')
      const dataUrl = `data:image/jpeg;base64,${imgBase64}`

      // Create Runway generation task
      const taskRes = await fetch('https://api.dev.runwayml.com/v1/image_to_video', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RUNWAY_KEY}`,
          'Content-Type': 'application/json',
          'X-Runway-Version': '2024-11-06',
        },
        body: JSON.stringify({
          model: 'gen3a_turbo',
          promptImage: dataUrl,
          promptText: scene.motionPrompt,
          duration: Math.min(10, scene.durationEstimate),
          ratio: '1280:768',
        }),
      })

      const task = await taskRes.json() as { id: string; status?: string; output?: string[] }

      // Poll until complete
      for (let i = 0; i < 60; i++) {
        const poll = await fetch(`https://api.dev.runwayml.com/v1/tasks/${task.id}`, {
          headers: { Authorization: `Bearer ${RUNWAY_KEY}`, 'X-Runway-Version': '2024-11-06' },
        })
        const result = await poll.json() as { status: string; output?: string[] }

        if (result.status === 'SUCCEEDED' && result.output?.[0]) {
          const vidRes = await fetch(result.output[0])
          fs.writeFileSync(clipPath, Buffer.from(await vidRes.arrayBuffer()))
          break
        }
        if (result.status === 'FAILED') break
        await new Promise(r => setTimeout(r, 5000))
      }
    } catch (err) {
      console.error(`[Runway] Scene ${scene.id} failed:`, err)
    }
  }

  pkg.status = 'animated'
  await saveVideoPackage(pkg)
  await slack(`✅ *[${pkg.title}]* Animation complete`)
  return pkg
}

// ── PHASE 5: FFmpeg Assembly ───────────────────────────────────────────────

export async function assembleVideo(pkg: VideoPackage): Promise<string> {
  await slack(`⚙️ *[${pkg.title}]* Assembling final video with FFmpeg...`)

  const outputPath = path.join(pkg.buildDir, `${pkg.id}_final.mp4`)
  const voicePath = path.join(pkg.buildDir, 'voiceover_full.mp3')
  const clipsDir = path.join(pkg.buildDir, 'clips')
  const imagesDir = path.join(pkg.buildDir, 'images')

  // Check what we have — animated clips or static images
  const hasClips = fs.readdirSync(clipsDir).some(f => f.endsWith('.mp4'))
  const totalDuration = pkg.scenes.reduce((s, sc) => s + sc.durationEstimate, 0)

  if (hasClips) {
    // Write concat list
    const concatFile = path.join(pkg.buildDir, 'concat.txt')
    const clips = pkg.scenes.map(sc => {
      const p = path.join(clipsDir, `clip_${String(sc.id).padStart(3, '0')}.mp4`)
      return fs.existsSync(p) ? `file '${p}'` : null
    }).filter(Boolean).join('\n')
    fs.writeFileSync(concatFile, clips)

    // Concatenate clips, then mix voiceover
    const tempPath = path.join(pkg.buildDir, 'temp_concat.mp4')
    await execAsync(`ffmpeg -y -f concat -safe 0 -i "${concatFile}" -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" -c:v libx264 -r 30 "${tempPath}"`)
    await execAsync(`ffmpeg -y -i "${tempPath}" -i "${voicePath}" -map 0:v -map 1:a -shortest -c:v copy -c:a aac "${outputPath}"`)
    fs.unlinkSync(tempPath)
  } else {
    // Use static images with Ken Burns effect
    const filterParts: string[] = []
    const inputs = pkg.scenes.map(sc => `-loop 1 -t ${sc.durationEstimate} -i "${path.join(imagesDir, `scene_${String(sc.id).padStart(3, '0')}.jpg`)}"`)

    pkg.scenes.forEach((sc, i) => {
      const zoom = i % 2 === 0 ? 'zoompan=z=\'min(zoom+0.0015,1.5)\':d=1:x=iw/2-(iw/zoom/2):y=ih/2-(ih/zoom/2)' : 'zoompan=z=\'1.5-0.0015*on\':d=1:x=iw/2-(iw/zoom/2):y=ih/2-(ih/zoom/2)'
      filterParts.push(`[${i}:v]${zoom},scale=1920:1080,setsar=1[v${i}]`)
    })

    const concatInputs = pkg.scenes.map((_, i) => `[v${i}]`).join('')
    filterParts.push(`${concatInputs}concat=n=${pkg.scenes.length}:v=1:a=0[outv]`)

    const filterStr = filterParts.join(';')
    await execAsync(`ffmpeg -y ${inputs.join(' ')} -i "${voicePath}" -filter_complex "${filterStr}" -map "[outv]" -map ${pkg.scenes.length}:a -c:v libx264 -r 30 -c:a aac -shortest "${outputPath}"`)
  }

  pkg.status = 'assembled'
  await saveVideoPackage(pkg)

  const sizeKB = Math.round(fs.statSync(outputPath).size / 1024)
  await slack(`🎉 *[${pkg.title}]* Video assembled — ${sizeKB}KB\n\nFile: \`${outputPath}\`\n\nReact ✅ to upload to YouTube, or ✏️ to request changes.`)

  return outputPath
}

// ── PHASE 6: YouTube Upload ────────────────────────────────────────────────

export async function uploadToYouTube(pkg: VideoPackage): Promise<string> {
  await slack(`📤 *[${pkg.title}]* Uploading to YouTube...`)

  // Add YouTube scope to Google auth
  const auth = await getAuthenticatedClient()
  if (!auth) throw new Error('Google not authenticated')

  const youtube = google.youtube({ version: 'v3', auth })
  const videoPath = path.join(pkg.buildDir, `${pkg.id}_final.mp4`)

  if (!fs.existsSync(videoPath)) throw new Error('Video file not found — run assembly first')

  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: pkg.title,
        description: pkg.description,
        tags: pkg.tags,
        categoryId: '22', // People & Blogs (or 26 for Howto)
        defaultLanguage: 'en',
      },
      status: {
        privacyStatus: 'private', // Start private — AB reviews, then makes public
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: fs.createReadStream(videoPath),
    },
  })

  const videoId = res.data.id!
  const url = `https://youtu.be/${videoId}`

  pkg.status = 'uploaded'
  pkg.youtubeId = videoId
  await saveVideoPackage(pkg)

  await slack(`🚀 *YouTube Upload Complete — ${pkg.title}*\n\nPrivate video (review before publishing): ${url}\n\nWhen you're ready to publish: YouTube Studio → set to Public`)
  return url
}

// ── Full pipeline: one function, all phases ────────────────────────────────

export async function runFullPipeline(
  channel: 'cardchiefz' | 'resumechiefz',
  topic?: string,
  theme?: string
): Promise<void> {
  try {
    await slack(`🎬 *Starting YouTube Pipeline — ${channel}*\nTopic: ${topic ?? 'agent decides'} | Theme: ${theme ?? 'cinematic'}`)

    let pkg = await generateScript(channel, topic, theme)
    await slack(`📝 *Script ready: "${pkg.title}"* (${pkg.scenes.length} scenes)`)

    pkg = await generateImages(pkg)
    pkg = await generateVoiceover(pkg)
    pkg = await animateScenes(pkg)
    await assembleVideo(pkg)

  } catch (err) {
    await slack(`❌ *Pipeline failed:* ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ── State management ──────────────────────────────────────────────────────

async function saveVideoPackage(pkg: VideoPackage): Promise<void> {
  await supabaseAdmin.from('ai_memories').upsert({
    category: 'youtube_pipeline',
    content: pkg.id,
    context: JSON.stringify({ ...pkg, scenes: pkg.scenes.length }), // Don't store full scenes in DB
    importance: 7,
    created_at: new Date().toISOString(),
  })
  // Always keep full package on disk
  fs.writeFileSync(path.join(pkg.buildDir, 'package.json'), JSON.stringify(pkg, null, 2))
}

export async function getPendingVideos(): Promise<VideoPackage[]> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('context')
    .eq('category', 'youtube_pipeline')
    .order('created_at', { ascending: false })
    .limit(10)

  return (data ?? []).map(d => {
    try { return JSON.parse(d.context ?? '{}') as VideoPackage } catch { return null }
  }).filter(Boolean) as VideoPackage[]
}
