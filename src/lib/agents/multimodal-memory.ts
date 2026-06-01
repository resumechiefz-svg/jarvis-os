/**
 * Multimodal Memory — store images in Jarvis memory, not just text
 * Photos of cards, screenshots of deals, whiteboard captures
 * Claude Vision analyzes and creates searchable text memory
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'
import { saveMemory } from '../memory/vectors'
import { getAuthenticatedClient } from '../google/auth'
import { google } from 'googleapis'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface ImageMemory {
  id?: string
  description: string    // Claude's analysis
  tags: string[]         // Searchable tags
  storedAt: string
  driveFileId?: string   // If stored in Drive
  thumbnail?: string     // Base64 preview
  context: string        // What AB said about it
}

// Analyze image and store as searchable memory
export async function saveImageMemory(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp',
  userContext: string
): Promise<ImageMemory> {

  // Analyze with Claude Vision
  const msg = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
        {
          type: 'text',
          text: `Analyze this image for storage in AB's personal memory system.

User context: "${userContext}"

Provide:
1. Detailed description (what it is, key details, anything notable)
2. Tags for searching later (e.g., card name, player, year, company name, etc.)
3. Action items or follow-ups if any are visible or implied

Return JSON: {"description": "...", "tags": ["...", "..."], "actionItems": ["..."]}`,
        },
      ],
    }],
  })

  let description = ''
  let tags: string[] = []
  let actionItems: string[] = []

  try {
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const match = text.match(/\{[\s\S]*\}/)
    const data = match ? JSON.parse(match[0]) : {}
    description = data.description ?? ''
    tags = data.tags ?? []
    actionItems = data.actionItems ?? []
  } catch { description = userContext }

  // Store image in Google Drive
  let driveFileId = ''
  try {
    const auth = await getAuthenticatedClient()
    if (auth) {
      const drive = google.drive({ version: 'v3', auth })
      const buffer = Buffer.from(imageBase64, 'base64')

      // Find or create Jarvis Images folder
      const folderSearch = await drive.files.list({
        q: "name='Jarvis Images' and mimeType='application/vnd.google-apps.folder' and trashed=false",
        fields: 'files(id)',
      })

      let folderId = folderSearch.data.files?.[0]?.id ?? ''
      if (!folderId) {
        const folder = await drive.files.create({
          requestBody: { name: 'Jarvis Images', mimeType: 'application/vnd.google-apps.folder' },
          fields: 'id',
        })
        folderId = folder.data.id ?? ''
      }

      const file = await drive.files.create({
        requestBody: {
          name: `jarvis-image-${Date.now()}.jpg`,
          parents: [folderId],
        },
        media: { mimeType: mediaType, body: buffer },
        fields: 'id',
      })
      driveFileId = file.data.id ?? ''
    }
  } catch { /* Drive storage optional */ }

  const memory: ImageMemory = {
    description,
    tags,
    storedAt: new Date().toISOString(),
    driveFileId,
    context: userContext,
  }

  // Save to Supabase as searchable memory
  const { data } = await supabaseAdmin.from('ai_memories').insert({
    category: 'image_memory',
    content: `[Image] ${description.slice(0, 150)}`,
    context: JSON.stringify({ ...memory, actionItems }),
    importance: 7,
    created_at: new Date().toISOString(),
  }).select('id').single()

  if (data?.id) memory.id = data.id

  // Save to vector store for semantic search
  await saveMemory({
    category: 'image_memory',
    content: `Image: ${description}. Tags: ${tags.join(', ')}`,
    context: userContext,
    importance: 7,
  })

  return memory
}

// Search image memories by description
export async function searchImageMemories(query: string): Promise<ImageMemory[]> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('context, content, created_at')
    .eq('category', 'image_memory')
    .or(`content.ilike.%${query}%,context.ilike.%${query}%`)
    .order('created_at', { ascending: false })
    .limit(5)

  return (data ?? []).map(d => {
    try { return JSON.parse(d.context ?? '{}') as ImageMemory } catch { return null }
  }).filter(Boolean) as ImageMemory[]
}
