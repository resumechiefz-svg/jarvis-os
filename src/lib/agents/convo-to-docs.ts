/**
 * Conversation → Google Docs
 * Important conversations auto-summarized into a living Google Doc
 * Organized by month, searchable, permanent record
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../supabase/client'
import { getAuthenticatedClient } from '../google/auth'
import { google } from 'googleapis'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function getOrCreateMonthDoc(monthKey: string): Promise<string> {
  // Check if we have the doc ID stored
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('context')
    .eq('category', 'monthly_doc_id')
    .eq('content', monthKey)
    .single()

  if (data?.context) return data.context

  // Create new Google Doc for this month
  const auth = await getAuthenticatedClient()
  if (!auth) throw new Error('Google not connected')

  const docs = google.docs({ version: 'v1', auth })
  const drive = google.drive({ version: 'v3', auth })

  const title = `Jarvis — ${new Date(monthKey + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
  const doc = await docs.documents.create({ requestBody: { title } })
  const docId = doc.data.documentId!

  // Add header
  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [{
        insertText: {
          location: { index: 1 },
          text: `${title}\nAB Command Center — Decisions, Conversations, Insights\n\n`,
        },
      }],
    },
  })

  // Move to Jarvis folder in Drive
  const folderSearch = await drive.files.list({
    q: "name='Jarvis Conversations' and mimeType='application/vnd.google-apps.folder' and trashed=false",
    fields: 'files(id)',
  })
  let folderId = folderSearch.data.files?.[0]?.id ?? ''
  if (!folderId) {
    const folder = await drive.files.create({
      requestBody: { name: 'Jarvis Conversations', mimeType: 'application/vnd.google-apps.folder' },
      fields: 'id',
    })
    folderId = folder.data.id ?? ''
  }
  if (folderId) {
    await drive.files.update({
      fileId: docId,
      addParents: folderId,
      requestBody: {},
    })
  }

  // Store doc ID
  await supabaseAdmin.from('ai_memories').insert({
    category: 'monthly_doc_id',
    content: monthKey,
    context: docId,
    importance: 8,
    created_at: new Date().toISOString(),
  })

  return docId
}

export async function appendConversationToDoc(
  userMessage: string,
  assistantReply: string,
  agentName: string
): Promise<void> {
  // Only log conversations that are substantive
  if (userMessage.length < 30 || assistantReply.length < 50) return

  // Summarize with Claude
  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 150,
    messages: [{
      role: 'user',
      content: `Summarize this conversation in 1-2 sentences capturing what was decided, learned, or discussed. No fluff.

AB: "${userMessage}"
${agentName.toUpperCase()}: "${assistantReply}"

Return just the summary, no preamble.`,
    }],
  })

  const summary = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
  if (!summary) return

  const monthKey = new Date().toISOString().slice(0, 7)
  const timestamp = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  try {
    const docId = await getOrCreateMonthDoc(monthKey)
    const auth = await getAuthenticatedClient()
    if (!auth) return

    const docs = google.docs({ version: 'v1', auth })

    // Get current doc to find end
    const doc = await docs.documents.get({ documentId: docId })
    const endIndex = doc.data.body?.content?.slice(-1)[0]?.endIndex ?? 1

    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [{
          insertText: {
            location: { index: endIndex - 1 },
            text: `[${timestamp}] ${agentName.toUpperCase()}: ${summary}\n`,
          },
        }],
      },
    })
  } catch { /* non-blocking — don't fail the response */ }
}

// Weekly: create a formatted summary section in the doc
export async function appendWeeklySection(weekSummary: string): Promise<void> {
  const monthKey = new Date().toISOString().slice(0, 7)
  const weekStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  try {
    const docId = await getOrCreateMonthDoc(monthKey)
    const auth = await getAuthenticatedClient()
    if (!auth) return

    const docs = google.docs({ version: 'v1', auth })
    const doc = await docs.documents.get({ documentId: docId })
    const endIndex = doc.data.body?.content?.slice(-1)[0]?.endIndex ?? 1

    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [{
          insertText: {
            location: { index: endIndex - 1 },
            text: `\n━━━ WEEK OF ${weekStr} ━━━\n${weekSummary}\n\n`,
          },
        }],
      },
    })
  } catch { /* non-blocking */ }
}
