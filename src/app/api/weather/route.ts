import { NextResponse } from 'next/server'

export const revalidate = 1800  // cache 30 min

interface WttrCurrent {
  temp_F: string
  FeelsLikeF: string
  humidity: string
  windspeedMiles: string
  weatherDesc: Array<{ value: string }>
  weatherCode: string
}

interface WttrDay {
  hourly: Array<{ tempF: string; weatherDesc: Array<{ value: string }>; time: string }>
  maxtempF: string
  mintempF: string
  date: string
}

export async function GET() {
  try {
    const res = await fetch('https://wttr.in/Charlotte,NC?format=j1', {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'JarvisOS/1.0' },
    })
    const data = await res.json() as {
      current_condition: WttrCurrent[]
      weather: WttrDay[]
      nearest_area: Array<{ areaName: Array<{ value: string }>; region: Array<{ value: string }> }>
    }

    const cur = data.current_condition[0]
    const today = data.weather[0]
    const tomorrow = data.weather[1]
    const area = data.nearest_area[0]

    const condition = cur.weatherDesc[0]?.value ?? 'Clear'
    const code = parseInt(cur.weatherCode)
    const emoji = getEmoji(code)

    return NextResponse.json({
      location: `${area.areaName[0]?.value}, ${area.region[0]?.value}`,
      temp: parseInt(cur.temp_F),
      feelsLike: parseInt(cur.FeelsLikeF),
      humidity: parseInt(cur.humidity),
      wind: parseInt(cur.windspeedMiles),
      condition,
      emoji,
      high: parseInt(today.maxtempF),
      low: parseInt(today.mintempF),
      tomorrow: {
        high: parseInt(tomorrow?.maxtempF ?? '0'),
        low: parseInt(tomorrow?.mintempF ?? '0'),
        condition: getUpcomingCondition(tomorrow),
      },
      // Human-friendly summary for TTS
      summary: buildSummary(cur, today, tomorrow, condition, emoji),
    })
  } catch {
    return NextResponse.json({ error: 'Weather unavailable' }, { status: 503 })
  }
}

function getEmoji(code: number): string {
  if (code === 113) return '☀️'
  if (code === 116) return '⛅'
  if ([119, 122].includes(code)) return '☁️'
  if ([176, 263, 266, 281, 284, 293, 296, 299, 302, 305, 308].includes(code)) return '🌧️'
  if ([200, 386, 389, 392, 395].includes(code)) return '⛈️'
  if ([179, 182, 185, 317, 320, 323, 326, 329, 332, 335, 338, 350, 353, 356, 359, 362, 365, 368, 371, 374, 377].includes(code)) return '🌨️'
  return '🌤️'
}

function getUpcomingCondition(day: WttrDay): string {
  if (!day) return 'Unknown'
  const noon = day.hourly.find(h => h.time === '1200') ?? day.hourly[3]
  return noon?.weatherDesc[0]?.value ?? 'Clear'
}

function buildSummary(cur: WttrCurrent, today: WttrDay, tomorrow: WttrDay, condition: string, emoji: string): string {
  const high = today.maxtempF
  const low = today.mintempF
  const tmrHigh = tomorrow?.maxtempF ?? high
  const tmrCond = getUpcomingCondition(tomorrow)
  return `${emoji} ${condition}, ${cur.temp_F}°F right now in Charlotte. Feels like ${cur.FeelsLikeF}°. Today's high ${high}°, low ${low}°. Tomorrow: ${tmrCond}, high ${tmrHigh}°.`
}
