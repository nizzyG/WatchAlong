import { Film, Library as LibraryIcon, Plus } from 'lucide-react'
import type { LibraryViewPreference, SessionLibrary } from '@shared/types'
import { LibrarySessionCard } from './LibrarySessionCard'

export { LibrarySessionCard } from './LibrarySessionCard'

interface LibraryHomeProps {
  library: SessionLibrary
  view: LibraryViewPreference
  onNew(): void
  onOpenSession(sessionId: string): void
  onRename(sessionId: string): void
  onDelete(sessionId: string): void
}

export function LibraryHome({ library, view, onNew, onOpenSession, onRename, onDelete }: LibraryHomeProps): JSX.Element {
  const hasSessions = library.sessions.length > 0
  const sessions = [...library.sessions].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))

  return (
    <section className={`library-home library-home-${view}`} aria-label="WatchAlong Library">
      <header className="library-home-header">
        <div className="library-home-brand">
          <span className="library-home-mark" aria-hidden>
            <Film size={18} />
          </span>
          <h1>WatchAlong</h1>
          {hasSessions && <p>{library.sessions.length} saved watchalong{library.sessions.length === 1 ? '' : 's'}</p>}
        </div>
        {hasSessions && (
          <button className="primary-button" type="button" onClick={onNew}>
            <Plus size={18} aria-hidden />
            New WatchAlong
          </button>
        )}
      </header>

      {!hasSessions && (
        <div className="library-empty-state">
          <div className="library-empty-icon">
            <LibraryIcon size={42} aria-hidden />
          </div>
          <h2>Your watchalong collection is empty</h2>
          <p>Start your first watchalong - it only takes a minute.</p>
          <button className="primary-button" type="button" onClick={onNew}>
            <Plus size={18} aria-hidden />
            New WatchAlong
          </button>
          <p className="library-ownership-line">WatchAlong works with your own media files. Nothing leaves this device.</p>
        </div>
      )}

      {hasSessions && (
        <div className="library-session-grid">
          {sessions.map((session) => (
            <LibrarySessionCard
              key={session.id}
              session={session}
              compact={view === 'list'}
              onOpen={() => onOpenSession(session.id)}
              onRename={() => onRename(session.id)}
              onDelete={() => onDelete(session.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

