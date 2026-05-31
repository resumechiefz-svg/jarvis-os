/**
 * Google Sheets — financial tracking, portfolio snapshots, RC metrics
 * Creates and maintains a "Jarvis Dashboard" spreadsheet in AB's Drive
 */
import { google } from 'googleapis'
import { getAuthenticatedClient } from './auth'
import { supabaseAdmin } from '../supabase/client'

async function getOrCreateSheet(title: string): Promise<string> {
  // Check if we have the sheet ID stored
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('context')
    .eq('category', 'google_sheet_id')
    .eq('content', title)
    .single()

  if (data?.context) return data.context

  // Create new sheet
  const auth = await getAuthenticatedClient()
  if (!auth) throw new Error('Google not connected')

  const sheets = google.sheets({ version: 'v4', auth })
  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [
        { properties: { title: 'Portfolio', sheetId: 0 } },
        { properties: { title: 'Revenue', sheetId: 1 } },
        { properties: { title: 'Expenses', sheetId: 2 } },
        { properties: { title: 'Training Log', sheetId: 3 } },
      ],
    },
  })

  const spreadsheetId = res.data.spreadsheetId!

  // Add headers
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        { range: 'Portfolio!A1:F1', values: [['Date', 'Equity', 'Day P&L', 'Day P&L %', 'Cash', 'Positions']] },
        { range: 'Revenue!A1:E1', values: [['Date', 'Source', 'Amount', 'Type', 'Notes']] },
        { range: 'Expenses!A1:D1', values: [['Date', 'Category', 'Amount', 'Notes']] },
        { range: 'Training Log!A1:E1', values: [['Date', 'Type', 'Miles', 'Duration', 'Notes']] },
      ],
    },
  })

  // Save the ID
  await supabaseAdmin.from('ai_memories').insert({
    category: 'google_sheet_id',
    content: title,
    context: spreadsheetId,
    importance: 9,
  })

  return spreadsheetId
}

export async function logPortfolioSnapshot(data: {
  equity: number; dayPL: number; dayPLPct: number; cash: number; positions: number
}): Promise<void> {
  const auth = await getAuthenticatedClient()
  if (!auth) return

  const spreadsheetId = await getOrCreateSheet('Jarvis Dashboard')
  const sheets = google.sheets({ version: 'v4', auth })

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Portfolio!A:F',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        new Date().toLocaleDateString('en-US'),
        data.equity,
        data.dayPL,
        `${data.dayPLPct.toFixed(2)}%`,
        data.cash,
        data.positions,
      ]],
    },
  })
}

export async function logRevenue(source: string, amount: number, type: 'subscription' | 'sale' | 'deposit', notes = ''): Promise<void> {
  const auth = await getAuthenticatedClient()
  if (!auth) return

  const spreadsheetId = await getOrCreateSheet('Jarvis Dashboard')
  const sheets = google.sheets({ version: 'v4', auth })

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Revenue!A:E',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[new Date().toLocaleDateString('en-US'), source, amount, type, notes]] },
  })
}

export async function logTraining(type: string, miles: number, duration: string, notes = ''): Promise<void> {
  const auth = await getAuthenticatedClient()
  if (!auth) return

  const spreadsheetId = await getOrCreateSheet('Jarvis Dashboard')
  const sheets = google.sheets({ version: 'v4', auth })

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Training Log!A:E',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[new Date().toLocaleDateString('en-US'), type, miles, duration, notes]] },
  })
}

export async function getSheetUrl(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('ai_memories')
    .select('context')
    .eq('category', 'google_sheet_id')
    .eq('content', 'Jarvis Dashboard')
    .single()
  return data?.context ? `https://docs.google.com/spreadsheets/d/${data.context}` : null
}
