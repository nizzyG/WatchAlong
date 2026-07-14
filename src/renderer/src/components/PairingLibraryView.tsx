import type { LibrarySession } from '@shared/types'
import { LibrarySessionCard } from './LibrarySessionCard'
import { deriveReactorIdentity, pairingDisplayTitle, sortPairings, type LibrarySort } from './libraryPresentation'

export function PairingLibraryView({
  sessions,
  sort,
  compact,
  onOpenSession,
  onChoosePoster,
  onClearPoster,
  onRename,
  onEditReactor,
  onDelete
}: {
  sessions: LibrarySession[]
  sort: LibrarySort
  compact: boolean
  onOpenSession(sessionId: string): void
  onChoosePoster(sessionId: string): void
  onClearPoster(sessionId: string): void
  onRename(sessionId: string, returnFocusTarget: HTMLButtonElement | null): void
  onEditReactor(sessionId: string, returnFocusTarget: HTMLButtonElement | null): void
  onDelete(sessionId: string, returnFocusTarget: HTMLButtonElement | null): void
}): JSX.Element {
  return (
    <div className={`pairing-library-grid ${compact ? 'pairing-library-grid-compact' : ''}`} aria-label="Pairings">
      {sortPairings(sessions, sort).map((session) => {
        const reactor = deriveReactorIdentity(session)
        return (
          <LibrarySessionCard
            key={session.id}
            session={session}
            compact={compact}
            primaryLabel={pairingDisplayTitle(session)}
            artwork="movie"
            reactorLabel={reactor.label}
            showReactorBadge
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
  )
}
