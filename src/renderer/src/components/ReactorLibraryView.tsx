import type { LibrarySession } from '@shared/types'
import { LibrarySessionCard } from './LibrarySessionCard'
import { deriveMovieIdentity, deriveReactorIdentity, groupSessionsByReactor } from './libraryPresentation'
import { ReactorAvatar } from './ReactorAvatar'

export function ReactorLibraryView({
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
    <div className={`reactor-library ${compact ? 'reactor-library-compact' : ''}`}>
      {groupSessionsByReactor(sessions).map((group, index) => {
        const headingId = `library-reactor-group-${index}`
        const representative = group.sessions[0]
        return (
          <section className="reactor-shelf" aria-labelledby={headingId} key={group.key}>
            <header className="reactor-shelf-header">
              <ReactorAvatar session={representative} label={group.label} size="group" />
              <div>
                <h2 id={headingId}>{group.label}</h2>
                <span>{pairingCount(group.sessions.length)}</span>
              </div>
            </header>
            <div className="reactor-shelf-movies">
              {group.sessions.map((session) => {
                const movie = deriveMovieIdentity(session)
                const reactor = deriveReactorIdentity(session)
                return (
                  <LibrarySessionCard
                    key={session.id}
                    session={session}
                    compact={compact}
                    primaryLabel={movie.label}
                    accessibleLabel={`${movie.label} with ${group.label}`}
                    artwork="movie"
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
