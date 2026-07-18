import type { LibrarySession, ReactorProfile } from '@shared/types'
import { LibrarySessionCard } from './LibrarySessionCard'
import { deriveMovieIdentity, deriveReactorIdentity, groupSessionsByReactor, type LibrarySort } from './libraryPresentation'
import { ReactorAvatar } from './ReactorAvatar'

export function ReactorLibraryView({
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
    <div className={`reactor-library ${sessions.length === 1 ? 'reactor-library-single' : ''} ${compact ? 'reactor-library-compact' : ''}`}>
      {groupSessionsByReactor(sessions, sort, reactors).map((group, index) => {
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
            <div className={`reactor-shelf-movies ${group.sessions.length === 1 ? 'reactor-shelf-movies-single' : ''}`}>
              {group.sessions.map((session) => {
                const movie = deriveMovieIdentity(session)
                const reactor = deriveReactorIdentity(session, reactors)
                return (
                  <LibrarySessionCard
                    key={session.id}
                    session={session}
                    compact={compact}
                    primaryLabel={movie.label}
                    accessibleLabel={`${movie.label} with ${group.label}`}
                    artwork="movie"
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
