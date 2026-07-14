import { Clapperboard, Film, LayoutGrid, Library as LibraryIcon, Plus, UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { LibraryViewPreference, SessionLibrary } from '@shared/types'
import { LibrarySessionCard } from './LibrarySessionCard'
import { ReactorAvatar } from './ReactorAvatar'
import {
  deriveMovieIdentity,
  deriveReactorIdentity,
  groupSessionsByMovie,
  groupSessionsByReactor,
  pairingDisplayTitle,
  sortPairings,
  type LibraryGroup,
  type LibraryMode
} from './libraryPresentation'

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
  const [mode, setMode] = useState<LibraryMode>(readSavedLibraryMode)
  const sessions = sortPairings(library.sessions)

  useEffect(() => {
    try {
      window.localStorage.setItem('watchalong-library-mode', mode)
    } catch {
      // A locked-down renderer can still use the in-memory view toggle.
    }
  }, [mode])

  return (
    <section className={`library-home library-home-${view} library-mode-${mode}`} aria-label="WatchAlong Library">
      <header className="library-home-header">
        <div className="library-home-brand">
          <span className="library-home-mark" aria-hidden>
            <Film size={18} />
          </span>
          <div>
            <p className="library-home-kicker">Your local film shelf</p>
            <h1>WatchAlong</h1>
            <p className="library-home-deck">Your films. Their reactions. Kept on your drive.</p>
          </div>
        </div>
        {hasSessions && (
          <div className="library-header-actions">
            <div className="library-mode-switch" role="group" aria-label="Organize library">
              <LibraryModeButton active={mode === 'pairings'} icon={<LayoutGrid size={16} />} label="Pairings" onClick={() => setMode('pairings')} />
              <LibraryModeButton active={mode === 'reactors'} icon={<UsersRound size={16} />} label="By Reactor" onClick={() => setMode('reactors')} />
              <LibraryModeButton active={mode === 'movies'} icon={<Clapperboard size={16} />} label="By Movie" onClick={() => setMode('movies')} />
            </div>
            <button className="primary-button" type="button" onClick={onNew}>
              <Plus size={18} aria-hidden />
              New WatchAlong
            </button>
          </div>
        )}
      </header>

      {!hasSessions && (
        <div className="library-empty-state">
          <div className="library-empty-icon">
            <LibraryIcon size={42} aria-hidden />
          </div>
          <p className="library-empty-kicker">An empty shelf is a beginning.</p>
          <h2>Pair a film with a creator you support</h2>
          <p>Choose your movie and reaction. WatchAlong keeps both files and every setting on this computer.</p>
          <button className="primary-button" type="button" onClick={onNew}>
            <Plus size={18} aria-hidden />
            Make Your First Pairing
          </button>
          <p className="library-ownership-line">No account. No telemetry. No rented library.</p>
        </div>
      )}

      {hasSessions && mode === 'pairings' && (
        <div className="library-session-grid">
          {sessions.map((session) => (
            <LibrarySessionCard
              key={session.id}
              session={session}
              compact={view === 'list'}
              primaryLabel={pairingDisplayTitle(session)}
              artwork="reactor"
              reactorLabel={deriveReactorIdentity(session).label}
              onOpen={() => onOpenSession(session.id)}
              onRename={() => onRename(session.id)}
              onDelete={() => onDelete(session.id)}
            />
          ))}
        </div>
      )}

      {hasSessions && mode === 'reactors' && (
        <GroupedLibrary
          groups={groupSessionsByReactor(library.sessions)}
          kind="reactor"
          compact={view === 'list'}
          onOpenSession={onOpenSession}
          onRename={onRename}
          onDelete={onDelete}
        />
      )}

      {hasSessions && mode === 'movies' && (
        <GroupedLibrary
          groups={groupSessionsByMovie(library.sessions)}
          kind="movie"
          compact={view === 'list'}
          onOpenSession={onOpenSession}
          onRename={onRename}
          onDelete={onDelete}
        />
      )}
    </section>
  )
}

function LibraryModeButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean
  icon: JSX.Element
  label: string
  onClick(): void
}): JSX.Element {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}>
      <span aria-hidden>{icon}</span>
      {label}
    </button>
  )
}

function GroupedLibrary({
  groups,
  kind,
  compact,
  onOpenSession,
  onRename,
  onDelete
}: {
  groups: LibraryGroup[]
  kind: 'reactor' | 'movie'
  compact: boolean
  onOpenSession(sessionId: string): void
  onRename(sessionId: string): void
  onDelete(sessionId: string): void
}): JSX.Element {
  return (
    <div className="library-groups">
      {groups.map((group, index) => {
        const headingId = `library-${kind}-group-${index}`
        const representative = group.sessions[0]
        return (
          <section className="library-group" aria-labelledby={headingId} key={group.key}>
            <header className="library-group-header">
              {kind === 'reactor'
                ? <ReactorAvatar session={representative} label={group.label} size="group" />
                : <span className="library-group-film-mark" aria-hidden><Film size={24} /></span>}
              <div>
                <p>{kind === 'reactor' ? 'Creator shelf' : 'Film shelf'}</p>
                <h2 id={headingId}>{group.label}</h2>
                <span>{pairingCount(group.sessions.length)}</span>
              </div>
            </header>
            <div className="library-session-grid">
              {group.sessions.map((session) => {
                const reactor = deriveReactorIdentity(session)
                const movie = deriveMovieIdentity(session)
                return (
                  <LibrarySessionCard
                    key={session.id}
                    session={session}
                    compact={compact}
                    primaryLabel={kind === 'reactor' ? movie.label : reactor.label}
                    secondaryLabel={kind === 'reactor' ? reactor.label : movie.label}
                    artwork={kind === 'movie' ? 'reactor' : 'movie'}
                    reactorLabel={reactor.label}
                    onOpen={() => onOpenSession(session.id)}
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

function readSavedLibraryMode(): LibraryMode {
  try {
    const savedMode = window.localStorage.getItem('watchalong-library-mode')
    if (savedMode === 'reactors' || savedMode === 'movies' || savedMode === 'pairings') {
      return savedMode
    }
  } catch {
    // Use the clearest default when storage is unavailable.
  }

  return 'pairings'
}

