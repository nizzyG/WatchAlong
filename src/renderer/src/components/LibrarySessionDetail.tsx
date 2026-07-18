import { ArrowLeft, Play, SlidersHorizontal } from 'lucide-react'
import type { RefObject } from 'react'
import type { LibrarySession, ReactorProfile } from '@shared/types'
import { formatTime } from './appFormat'
import { deriveMovieIdentity, deriveReactorIdentity } from './libraryPresentation'
import { libraryPrimaryAction, libraryProgress, type LibrarySessionStartIntent } from './libraryPlayback'
import { MoviePoster } from './MoviePoster'
import { ReactorAvatar } from './ReactorAvatar'

export function LibrarySessionDetail({
  session,
  reactors,
  backButtonRef,
  onBack,
  onStart
}: {
  session: LibrarySession
  reactors: readonly ReactorProfile[]
  backButtonRef: RefObject<HTMLButtonElement>
  onBack(): void
  onStart(intent: LibrarySessionStartIntent): void
}): JSX.Element {
  const movie = deriveMovieIdentity(session)
  const reactor = deriveReactorIdentity(session, reactors)
  const action = libraryPrimaryAction(session)
  const progress = libraryProgress(session)
  const automatic = session.timingOrigin === 'automatic'
  const customPairingTitle = customDetailTitle(session, movie.label, reactor.label)
  const detailHeadingId = `library-session-detail-${session.id}`

  return (
    <section
      className="library-session-detail"
      aria-labelledby={detailHeadingId}
    >
      <button ref={backButtonRef} className="library-detail-back" type="button" onClick={onBack}>
        <ArrowLeft size={19} aria-hidden />
        Back to library
      </button>

      <div className="library-detail-stage">
        <div className="library-detail-poster">
          <MoviePoster session={session} title={movie.label} size="group" ambient />
        </div>

        <div className="library-detail-copy">
          <h2 id={detailHeadingId}>{movie.label}</h2>

          <div className="library-detail-reactor">
            <ReactorAvatar session={session} label={reactor.label} />
            <div>
              <span>Reaction by</span>
              <strong>{reactor.label}</strong>
            </div>
          </div>

          {customPairingTitle && <p className="library-detail-pairing-title">{customPairingTitle}</p>}

          <div className={`library-detail-sync library-detail-sync-${session.syncReadiness}`}>
            <span aria-hidden />
            <div>
              <strong>{session.syncReadiness === 'ready' ? 'Timing ready' : 'Timing needs a quick check'}</strong>
              <small>
                {session.syncReadiness === 'ready'
                  ? automatic ? 'Found locally by WatchAlong' : 'Adjusted by hand'
                  : 'Line up one clear moment before watching'}
              </small>
            </div>
          </div>

          {progress.hasSavedPosition && (
            <div className="library-detail-resume">
              <div>
                <strong>Continue where you left off</strong>
                <span>{formatTime(session.lastReactionTimeSeconds)}</span>
              </div>
              {progress.percent !== null && (
                <span
                  className="library-detail-progress"
                  role="progressbar"
                  aria-label={`${Math.round(progress.percent)}% watched`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress.percent)}
                >
                  <span style={{ width: `${progress.percent}%` }} />
                </span>
              )}
            </div>
          )}

          <button className="primary-button library-detail-primary" type="button" onClick={() => onStart(action.intent)}>
            {action.intent === 'play'
              ? <Play size={21} fill="currentColor" aria-hidden />
              : <SlidersHorizontal size={21} aria-hidden />}
            {action.label}
          </button>
        </div>
      </div>
    </section>
  )
}

function customDetailTitle(session: LibrarySession, movieLabel: string, reactorLabel: string): string | null {
  if (session.titleOrigin !== 'custom') return null
  const title = session.title.trim()
  if (!title) return null
  const normalizedTitle = title.toLocaleLowerCase()
  if (normalizedTitle === movieLabel.toLocaleLowerCase()) return null
  if (normalizedTitle === `${movieLabel} — ${reactorLabel}`.toLocaleLowerCase()) return null
  return title
}
