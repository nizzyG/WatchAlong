import { Library as LibraryIcon, RefreshCw } from 'lucide-react'

export function StartupErrorState({
  message,
  onRetry,
  onOpenLibrary
}: {
  message: string
  onRetry(): void
  onOpenLibrary(): void
}): JSX.Element {
  return (
    <section className="startup-error-state" aria-label="Startup error">
      <div className="startup-error-card">
        <div className="startup-error-icon">
          <RefreshCw size={32} aria-hidden />
        </div>
        <h1>{message}</h1>
        <p>You can try again, or open the Library with anything WatchAlong could load.</p>
        <div className="startup-error-actions">
          <button className="primary-button" type="button" onClick={onRetry}>
            <RefreshCw size={17} aria-hidden />
            Retry
          </button>
          <button className="secondary-button" type="button" onClick={onOpenLibrary}>
            <LibraryIcon size={16} aria-hidden />
            Open Library
          </button>
        </div>
      </div>
    </section>
  )
}

