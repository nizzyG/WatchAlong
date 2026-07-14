import type { DownloadProgressEvent } from '@shared/types'

export function DownloadProgress({ event, compact = false }: { event: DownloadProgressEvent; compact?: boolean }): JSX.Element {
  const rawPercent = event.percent
  const determinate = rawPercent !== null
  const percent = rawPercent !== null ? Math.min(100, Math.max(0, rawPercent)) : 0
  const context = formatDownloadContext(event)

  return (
    <div className={`download-progress ${determinate ? 'download-progress-determinate' : 'download-progress-indeterminate'} ${compact ? 'download-progress-compact' : ''}`}>
      {context && <small className="download-progress-context">{context}</small>}
      <div
        className="download-progress-track"
        role="progressbar"
        aria-label={determinate ? `Download ${Math.round(percent)}% complete` : 'Download in progress'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={determinate ? Math.round(percent) : undefined}
      >
        <span style={determinate ? { width: `${percent}%` } : undefined} />
      </div>
    </div>
  )
}

export function formatDownloadContext(event: DownloadProgressEvent): string {
  const parts: string[] = []
  if (event.percent !== null) {
    parts.push(`${formatPercent(event.percent)}%`)
  }
  if (event.speed) {
    parts.push(event.speed)
  }
  if (event.eta) {
    parts.push(`${formatEta(event.eta)} left`)
  }
  if (
    typeof event.fragmentIndex === 'number' &&
    typeof event.fragmentCount === 'number' &&
    event.fragmentCount > 1
  ) {
    parts.push(`part ${event.fragmentIndex} of ${event.fragmentCount}`)
  }

  return parts.join(' · ')
}

function formatPercent(value: number): string {
  const clamped = Math.min(100, Math.max(0, value))
  return clamped >= 10 ? Math.round(clamped).toString() : clamped.toFixed(1).replace(/\.0$/, '')
}

function formatEta(value: string): string {
  const segments = value.split(':').map((segment) => Number.parseInt(segment, 10))
  if (segments.length >= 2 && segments.length <= 3 && segments.every((segment) => Number.isFinite(segment) && segment >= 0)) {
    const [hours, minutes, seconds] = segments.length === 3
      ? segments
      : [0, segments[0], segments[1]]
    const totalSeconds = hours * 3600 + minutes * 60 + seconds
    if (totalSeconds >= 3600) {
      const remainingMinutes = Math.floor((totalSeconds % 3600) / 60)
      return `${Math.floor(totalSeconds / 3600)} hr${remainingMinutes > 0 ? ` ${remainingMinutes} min` : ''}`
    }
    if (totalSeconds >= 60) {
      return `${Math.ceil(totalSeconds / 60)} min`
    }
    return `${totalSeconds} sec`
  }

  return value
}
