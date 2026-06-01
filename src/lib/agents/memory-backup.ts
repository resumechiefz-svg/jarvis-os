/**
 * Memory Backup — exports ai_memories to Google Drive nightly
 * Protects Jarvis's brain against data loss
 */
import { supabaseAdmin } from '../supabase/client'
import { getAuthenticatedClient } from '../google/auth'
import { google } from 'googleapis'

export async function backupMemoryToDrive(): Promise<string> {
  const auth = await getAuthenticatedClient()
  if (!auth) throw new Error('Google not connected')

  // Export all memories
  const { data: memories } = await supabaseAdmin
    .from('ai_memories')
    .select('id, category, content, context, importance, created_at')
    .order('created_at', { ascending: false })
    .limit(5000)

  const backup = {
    exportedAt: new Date().toISOString(),
    totalRecords: memories?.length ?? 0,
    memories: memories ?? [],
  }

  const drive = google.drive({ version: 'v3', auth })
  const fileName = `jarvis-memory-backup-${new Date().toISOString().split('T')[0]}.json`
  const content = JSON.stringify(backup, null, 2)

  // Find or create Jarvis backups folder
  let folderId: string
  const folderSearch = await drive.files.list({
    q: "name='Jarvis Backups' and mimeType='application/vnd.google-apps.folder' and trashed=false",
    fields: 'files(id)',
  })

  if (folderSearch.data.files?.length) {
    folderId = folderSearch.data.files[0].id!
  } else {
    const folder = await drive.files.create({
      requestBody: { name: 'Jarvis Backups', mimeType: 'application/vnd.google-apps.folder' },
      fields: 'id',
    })
    folderId = folder.data.id!
  }

  // Upload backup file
  const file = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType: 'application/json', body: content },
    fields: 'id, webViewLink',
  })

  // Keep only last 7 backups to save space
  const oldBackups = await drive.files.list({
    q: `'${folderId}' in parents and name contains 'jarvis-memory-backup' and trashed=false`,
    orderBy: 'createdTime asc',
    fields: 'files(id, name)',
  })

  const files = oldBackups.data.files ?? []
  if (files.length > 7) {
    for (const old of files.slice(0, files.length - 7)) {
      await drive.files.delete({ fileId: old.id! }).catch(() => {})
    }
  }

  console.log(`[Memory Backup] ${memories?.length ?? 0} records → ${fileName}`)
  return file.data.webViewLink ?? ''
}
