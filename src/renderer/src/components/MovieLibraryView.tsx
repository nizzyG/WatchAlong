import type { LibrarySession, ReactorProfile } from '@shared/types'
import { LibrarySessionCard } from './LibrarySessionCard'
import { MoviePoster } from './MoviePoster'
import { deriveReactorIdentity, groupSessionsByMovie, type LibrarySort } from './libraryPresentation'

export function MovieLibraryView({
  sessions,
  reactors,
  sort,
  compact,
  onOpenSession,
  onRegisterSessionCard,
  onSessionCardFocus,
  onChoosePoster,
  onClearPoster,
  onRename,
  onEditReactor,
  onDelete
}: {
  sessions: LibrarySession[]
  reactors: ReactorProfile[]
  sort: LibrarySort
  compact: boolean
  onOpenSession(sessionId: string): void
  onRegisterSessionCard(sessionId: string, button: HTMLButtonElement | null): void
  onSessionCardFocus(sessionId: string): void
  onChoosePoster(sessionId: string): void
  onClearPoster(sessionId: string): void
  onRename(sessionId: string, returnFocusTarget: HTMLButtonElement | null): void
  onEditReactor(sessionId: string, returnFocusTarget: HTMLButtonElement | null): void
  onDelete(sessionId: string, returnFocusTarget: HTMLButtonElement | null): void
}): JSX.Element {
  return (
    <div className={`movie-library-grid ${compact ? 'movie-library-grid-compact' : ''}`}>
      {groupSessionsByMovie(sessions, sort, reactors).map((group, index) => {
        const headingId = `library-movie-group-${index}`
        const representative = group.sessions[0]
        const posterRepresentative = group.sessions.find((session) => session.moviePosterPath) ?? representative
        return (
          <section className="movie-shelf-card" aria-labelledby={headingId} key={group.key}>
            <header className="movie-shelf-header">
              <MoviePoster session={posterRepresentative} title={group.label} size="group" ambient />
              <div className="movie-shelf-heading">
                <h2 id={headingId}>{group.label}</h2>
                <span>{pairingCount(group.sessions.length)}</span>
              </div>
            </header>
            <div className="movie-shelf-pairings" aria-label={`Reactions for ${group.label}`}>
              {group.sessions.map((session) => {
                const reactor = deriveReactorIdentity(session, reactors)
                return (
                  <LibrarySessionCard
                    key={session.id}
                    session={session}
                    compact
                    primaryLabel={reactor.label}
                    accessibleLabel={`${reactor.label} for ${group.label}`}
                    artwork="reactor"
                    reactorLabel={reactor.label}
                    openLabelPrefix="View details for"
                    onRegisterMainButton={(button) => onRegisterSessionCard(session.id, button)}
                    onMainButtonFocus={() => onSessionCardFocus(session.id)}
                    onOpen={() => onOpenSession(session.id)}
                    onChoosePoster={session.moviePath ? () => onChoosePoster(session.id) : undefined}
                    onClearPoster={session.moviePath ? () => onClearPoster(session.id) : undefined}
                    onRename={(returnFocusTarget) => onRename(session.id, returnFocusTarget)}
                    onEditReactor={(returnFocusTarget) => onEditReactor(session.id, returnFocusTarget)}
                    onDelete={(returnFocusTarget) => onDelete(session.id, returnFocusTarget)}
                  />
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function pairingCount(count: number): string {
  return `${count} pairing${count === 1 ? '' : 's'}`
}
