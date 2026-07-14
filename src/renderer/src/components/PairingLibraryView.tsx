import type { LibrarySession } from '@shared/types'
import { LibrarySessionCard } from './LibrarySessionCard'
import { deriveReactorIdentity, pairingDisplayTitle, sortPairings } from './libraryPresentation'

export function PairingLibraryView({
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
    <div className={`pairing-library-grid ${compact ? 'pairing-library-grid-compact' : ''}`} aria-label="Pairings">
      {sortPairings(sessions).map((session) => {
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
            onRename={() => onRename(session.id)}
            onDelete={() => onDelete(session.id)}
          />
        )
      })}
    </div>
  )
}
