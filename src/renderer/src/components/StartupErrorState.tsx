import { FolderOpen, Library, RefreshCw } from 'lucide-react'

export function StartupErrorState({
  message,
  recoveryAvailable,
  onRetry,
  onShowRecovery,
  onStartFresh
}: {
  message: string
  recoveryAvailable: boolean
  onRetry(): void
  onShowRecovery(): void
  onStartFresh(): void
}): JSX.Element {
  return (
    <section className="startup-error-state" aria-label="Startup error">
      <div className="startup-error-card">
        <div className="startup-error-icon">
          <RefreshCw size={32} aria-hidden />
        </div>
        <h1>{message}</h1>
        <p>
          {recoveryAvailable
            ? 'Your movies and reactions are untouched. The damaged library was moved aside, and its recovery copy will stay safe even if you start a new library.'
            : 'WatchAlong stopped before saving anything. Check that the drive is connected and writable, then try again.'}
        </p>
        <div className="startup-error-actions">
          <button className="primary-button" type="button" onClick={onRetry}>
            <RefreshCw size={17} aria-hidden />
            Retry
          </button>
          {recoveryAvailable && (
            <>
              <button className="secondary-button" type="button" onClick={onShowRecovery}>
                <FolderOpen size={17} aria-hidden />
                Show Recovery File
              </button>
              <button className="secondary-button" type="button" onClick={onStartFresh}>
                <Library size={17} aria-hidden />
                Start New Library
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

