import { google } from 'googleapis'
import { getAuthenticatedClient } from './auth'

export interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  location?: string
  description?: string
  isAllDay: boolean
  calendar: string
  url?: string
}

export async function getUpcomingEvents(days = 7): Promise<CalendarEvent[]> {
  const auth = await getAuthenticatedClient()
  if (!auth) return []

  const calendar = google.calendar({ version: 'v3', auth })
  const now = new Date()
  const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: now.toISOString(),
    timeMax: future.toISOString(),
    maxResults: 50,
    singleEvents: true,
    orderBy: 'startTime',
  })

  return (res.data.items ?? []).map(event => ({
    id: event.id ?? '',
    title: event.summary ?? '(No title)',
    start: event.start?.dateTime ?? event.start?.date ?? '',
    end: event.end?.dateTime ?? event.end?.date ?? '',
    location: event.location ?? undefined,
    description: event.description ?? undefined,
    isAllDay: !event.start?.dateTime,
    calendar: 'primary',
    url: event.htmlLink ?? undefined,
  }))
}

export async function getTodaysEvents(): Promise<CalendarEvent[]> {
  const auth = await getAuthenticatedClient()
  if (!auth) return []

  const calendar = google.calendar({ version: 'v3', auth })
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date()
  end.setHours(23, 59, 59, 999)

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  })

  return (res.data.items ?? []).map(event => ({
    id: event.id ?? '',
    title: event.summary ?? '(No title)',
    start: event.start?.dateTime ?? event.start?.date ?? '',
    end: event.end?.dateTime ?? event.end?.date ?? '',
    location: event.location ?? undefined,
    description: event.description ?? undefined,
    isAllDay: !event.start?.dateTime,
    calendar: 'primary',
  }))
}

export async function createEvent(event: {
  title: string
  start: string  // ISO string
  end: string
  description?: string
  location?: string
}): Promise<string> {
  const auth = await getAuthenticatedClient()
  if (!auth) throw new Error('Google not connected')

  const calendar = google.calendar({ version: 'v3', auth })
  const res = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: event.title,
      start: { dateTime: event.start },
      end: { dateTime: event.end },
      description: event.description,
      location: event.location,
    },
  })
  return res.data.htmlLink ?? ''
}
