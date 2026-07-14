import type { LibrarySession } from '@shared/types'
import { LibrarySessionCard } from './LibrarySessionCard'
import { MoviePoster } from './MoviePoster'
import { deriveReactorIdentity, groupSessionsByMovie } from './libraryPresentation'

export function MovieLibraryView({
  sessions,
  compact,
  onOpenSession,
  onChoosePoster,
  onClearPoster,
  onRename,
  onDelete
}: {
  sessions: LibrarySession[]
  compact: boolean
  onOpenSession(sessionId: string): void
  onChoosePoster(sessionId: string): void
  onClearPoster(sessionId: string): void
  onRename(sessionId: string): void
  onDelete(sessionId: string): void
}): JSX.Element {
  return (
    <div className={`movie-library-grid ${compact ? 'movie-library-grid-compact' : ''}`}>
      {groupSessionsByMovie(sessions).map((group, index) => {
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
                const reactor = deriveReactorIdentity(session)
                return (
                  <LibrarySessionCard
                    key={session.id}
                    session={session}
                    compact
                    primaryLabel={reactor.label}
                    accessibleLabel={`${reactor.label} for ${group.label}`}
                    artwork="reactor"
                    reactorLabel={reactor.label}
                    onOpen={() => onOpenSession(session.id)}
                    onChoosePoster={session.moviePath ? () => onChoosePoster(session.id) : undefined}
                    onClearPoster={session.moviePath ? () => onClearPoster(session.id) : undefined}
                    onRename={() => onRename(session.id)}
                    onDelete={() => onDelete(session.id)}
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
