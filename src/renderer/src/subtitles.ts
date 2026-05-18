export interface SubtitleCue {
  start: number
  end: number
  text: string
}

const TIMESTAMP_PATTERN = /(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{1,3})/

export function parseSubtitleText(raw: string): SubtitleCue[] {
  return raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split(/\n{2,}/)
    .flatMap(parseCueBlock)
    .sort((a, b) => a.start - b.start)
}

export function getActiveSubtitleCue(cues: SubtitleCue[], timeSeconds: number): SubtitleCue | null {
  if (!Number.isFinite(timeSeconds)) {
    return null
  }

  return cues.find((cue) => timeSeconds >= cue.start && timeSeconds < cue.end) ?? null
}

function parseCueBlock(block: string): SubtitleCue[] {
  const lines = block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0 || lines[0] === 'WEBVTT' || lines[0].startsWith('NOTE')) {
    return []
  }

  const timingIndex = lines.findIndex((line) => line.includes('-->'))
  if (timingIndex === -1) {
    return []
  }

  const [startRaw, endRawWithSettings] = lines[timingIndex].split('-->')
  const endRaw = endRawWithSettings.trim().split(/\s+/)[0]
  const start = parseTimestamp(startRaw.trim())
  const end = parseTimestamp(endRaw)
  const text = sanitizeCueText(lines.slice(timingIndex + 1).join('\n'))

  if (start === null || end === null || end <= start || text.length === 0) {
    return []
  }

  return [{ start, end, text }]
}

function parseTimestamp(value: string): number | null {
  const match = TIMESTAMP_PATTERN.exec(value)
  if (!match) {
    return null
  }

  const hours = Number.parseInt(match[1] ?? '0', 10)
  const minutes = Number.parseInt(match[2], 10)
  const seconds = Number.parseInt(match[3], 10)
  const millis = Number.parseInt(match[4].padEnd(3, '0'), 10)
  if ([hours, minutes, seconds, millis].some((part) => !Number.isFinite(part))) {
    return null
  }

  return hours * 3600 + minutes * 60 + seconds + millis / 1000
}

function sanitizeCueText(value: string): string {
  return decodeEntities(value)
    .replace(/<[^>]*>/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
}
