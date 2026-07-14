import { Play } from 'lucide-react'
import type { LibrarySession } from '@shared/types'
import {
  continueWatchingSessions,
  deriveMovieIdentity,
  deriveReactorIdentity,
  sessionProgressPercent
} from './libraryPresentation'
import { MoviePoster } from './MoviePoster'

export function ContinueWatchingShelf({
  sessions,
  onOpenSession
}: {
  sessions: LibrarySession[]
  onOpenSession(sessionId: string): void
}): JSX.Element | null {
  const resumableSessions = continueWatchingSessions(sessions)
  if (resumableSessions.length === 0) return null

  return (
    <section className="continue-watching" aria-labelledby="continue-watching-heading">
      <header className="continue-watching-header">
        <div>
          <h2 id="continue-watching-heading">Continue Watching</h2>
          <p>Pick up exactly where you left off.</p>
        </div>
      </header>
      <div className="continue-watching-track">
        {resumableSessions.map((session) => (
          <ContinueWatchingCard
            key={session.id}
            session={session}
            onOpen={() => onOpenSession(session.id)}
          />
        ))}
      </div>
    </section>
  )
}

function ContinueWatchingCard({
  session,
  onOpen
}: {
  session: LibrarySession
  onOpen(): void
}): JSX.Element {
  const movie = deriveMovieIdentity(session)
  const reactor = deriveReactorIdentity(session)
  const progress = sessionProgressPercent(session)
  const roundedProgress = progress === null ? null : Math.round(progress)
  const timeLabel = playbackPositionLabel(session)

  return (
    <article className="continue-watching-card">
      <button
        type="button"
        aria-label={`Continue ${movie.label} with ${reactor.label}`}
        onClick={onOpen}
      >
        <span className="continue-watching-art" aria-hidden>
          <MoviePoster session={session} title={movie.label} />
        </span>
        <span className="continue-watching-copy">
          <span className="continue-watching-reactor">With {reactor.label}</span>
          <strong>{movie.label}</strong>
          <span className="continue-watching-time">{timeLabel}</span>
          <span
            className="continue-watching-progress"
            role={roundedProgress === null ? undefined : 'progressbar'}
            aria-label={roundedProgress === null ? undefined : `${movie.label}: ${roundedProgress}% watched`}
            aria-valuemin={roundedProgress === null ? undefined : 0}
            aria-valuemax={roundedProgress === null ? undefined : 100}
            aria-valuenow={roundedProgress ?? undefined}
          >
            <span style={{ width: `${progress ?? 0}%` }} />
          </span>
          <span className="continue-watching-action">
            <Play size={15} fill="currentColor" aria-hidden />
            Resume
          </span>
        </span>
      </button>
    </article>
  )
}

function playbackPositionLabel(session: LibrarySession): string {
  const position = formatPlaybackTime(session.lastReactionTimeSeconds)
  const duration = session.reactionDurationSeconds
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
    return `Resume at ${position}`
  }

  return `${position} of ${formatPlaybackTime(duration)}`
}

function formatPlaybackTime(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
