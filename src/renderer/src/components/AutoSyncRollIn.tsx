import { Loader2, SlidersHorizontal } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { AutoSyncProgressEvent } from '@shared/types'

export function AutoSyncRollIn({
  progress,
  finalizing,
  onUseManual
}: {
  progress: AutoSyncProgressEvent
  finalizing?: boolean
  onUseManual(): void
}): JSX.Element {
  const percent = Math.min(100, Math.max(0, progress.percent))
  const manualButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    manualButtonRef.current?.focus()
  }, [])

  return (
    <section
      className="auto-sync-rollin-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Finding automatic sync"
      onKeyDown={(event) => {
        if (event.key === 'Tab') {
          event.preventDefault()
          manualButtonRef.current?.focus()
        }
      }}
    >
      <div className="auto-sync-rollin-card" role="status" aria-live="polite">
        <span className="auto-sync-rollin-mark" aria-hidden>
          <Loader2 size={34} className="spin" />
        </span>
        <div className="auto-sync-rollin-copy">
          <p>Download saved</p>
          <h2>Finding the perfect sync</h2>
          <span>{progress.message}</span>
          <small>WatchAlong compares both videos on this computer. Nothing is uploaded.</small>
        </div>
        <div
          className="auto-sync-progress"
          role="progressbar"
          aria-label="Automatic sync progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
        <button
          ref={manualButtonRef}
          className="secondary-button"
          type="button"
          disabled={finalizing}
          onClick={onUseManual}
        >
          <SlidersHorizontal size={16} aria-hidden />
          {finalizing ? 'Opening Your WatchAlong…' : 'Line Up Manually Instead'}
        </button>
      </div>
    </section>
  )
}
