import { Film, Plus } from 'lucide-react'

export function WelcomeOverlay({
  onGetStarted,
  onDismiss
}: {
  onGetStarted(): void
  onDismiss(): void
}): JSX.Element {
  return (
    <section className="welcome-backdrop" aria-label="Welcome to WatchAlong">
      <div className="welcome-card">
        <div className="welcome-mark">
          <Film size={38} aria-hidden />
        </div>
        <div className="welcome-copy">
          <h1>Watch reactions alongside your own movies.</h1>
          <p>
            WatchAlong keeps everything local. Load a movie file you own, add a full-length reaction, and sync them in one private desktop session.
          </p>
        </div>
        <div className="welcome-actions">
          <button className="primary-button" type="button" onClick={onGetStarted}>
            <Plus size={18} aria-hidden />
            Get Started
          </button>
          <button className="secondary-button" type="button" onClick={onDismiss}>
            Not now
          </button>
        </div>
      </div>
    </section>
  )
}

