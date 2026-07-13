export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '00:00'
  }

  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const remainingSeconds = total % 60
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(remainingSeconds)}`
  }

  return `${pad(minutes)}:${pad(remainingSeconds)}`
}

export function formatRelativeTime(value: string): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) {
    return 'Unknown'
  }

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (elapsedSeconds < 60) {
    return 'Just now'
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60)
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} minute${elapsedMinutes === 1 ? '' : 's'} ago`
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) {
    return `${elapsedHours} hour${elapsedHours === 1 ? '' : 's'} ago`
  }

  const elapsedDays = Math.floor(elapsedHours / 24)
  if (elapsedDays < 30) {
    return `${elapsedDays} day${elapsedDays === 1 ? '' : 's'} ago`
  }

  const elapsedMonths = Math.floor(elapsedDays / 30)
  if (elapsedMonths < 12) {
    return `${elapsedMonths} month${elapsedMonths === 1 ? '' : 's'} ago`
  }

  const elapsedYears = Math.floor(elapsedMonths / 12)
  return `${elapsedYears} year${elapsedYears === 1 ? '' : 's'} ago`
}

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path
}

export function signedSeconds(value: number): string {
  const sign = value >= 0 ? '+' : '-'
  return `${sign}${Math.abs(value).toFixed(3)}s`
}

export function formatRatePercent(rate: number): string {
  const percent = (rate - 1) * 100
  const sign = percent >= 0 ? '+' : ''
  return `${sign}${percent.toFixed(3)}%`
}

export function formatRateDriftPerHour(rate: number): string {
  const secondsPerHour = (rate - 1) * 3600
  const sign = secondsPerHour >= 0 ? '+' : ''
  return `${sign}${secondsPerHour.toFixed(1)}s/hr`
}

export function formatFps(fps: number | null): string {
  if (fps === null || !Number.isFinite(fps)) {
    return 'unknown'
  }

  return fps.toFixed(3).replace(/\.?0+$/, '')
}

