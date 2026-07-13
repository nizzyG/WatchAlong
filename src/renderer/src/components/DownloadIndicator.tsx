import { Loader2 } from 'lucide-react'
import type { DownloadProgressEvent } from '@shared/types'

export function DownloadIndicator({ event }: { event: DownloadProgressEvent }): JSX.Element {
  const working = event.state === 'checking' || event.state === 'downloading'
  const label = event.source === 'youtube' ? 'YouTube reaction' : 'Patreon reaction'

  return (
    <aside className={`download-indicator download-indicator-${event.state}`} aria-live="polite">
      <div>
        <strong>{label}</strong>
        <span>{event.message}</span>
      </div>
      {working && <Loader2 size={17} aria-hidden className="spin" />}
      {event.percent !== null && (
        <div className="download-indicator-track" aria-hidden>
          <span style={{ width: `${event.percent}%` }} />
        </div>
      )}
    </aside>
  )
}

