import {
  Check,
  Clapperboard,
  Film,
  Grid2X2,
  LayoutGrid,
  Maximize,
  Minimize,
  Plus,
  Rows3,
  Settings,
  TriangleAlert,
  UsersRound
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { LibraryViewPreference, SessionLibrary } from '@shared/types'
import type { MoviePosterActionResult } from '../moviePosterActions'
import { LibraryEmptyState } from './LibraryEmptyState'
import { LibrarySortControl } from './LibrarySortControl'
import { MovieLibraryView } from './MovieLibraryView'
import { PairingLibraryView } from './PairingLibraryView'
import { ReactorLibraryView } from './ReactorLibraryView'
import { groupSessionsByMovie, type LibraryMode, type LibrarySort } from './libraryPresentation'

export { LibrarySessionCard } from './LibrarySessionCard'

interface LibraryHomeProps {
  library: SessionLibrary
  view: LibraryViewPreference
  onViewChange(view: LibraryViewPreference): void
  fullscreenActive: boolean
  onToggleFullscreen(): void
  onOpenCommandPanel(): void
  onNew(): void
  onOpenSession(sessionId: string): void
  onChoosePoster(sessionId: string): Promise<MoviePosterActionResult>
  onClearPoster(sessionId: string): Promise<MoviePosterActionResult>
  onRename(sessionId: string, returnFocusTarget: HTMLButtonElement | null): void
  onEditReactor(sessionId: string, returnFocusTarget: HTMLButtonElement | null): void
  onDelete(sessionId: string, returnFocusTarget: HTMLButtonElement | null): void
}

export function LibraryHome({
  library,
  view,
  onViewChange,
  fullscreenActive,
  onToggleFullscreen,
  onOpenCommandPanel,
  onNew,
  onOpenSession,
  onChoosePoster,
  onClearPoster,
  onRename,
  onEditReactor,
  onDelete
}: LibraryHomeProps): JSX.Element {
  const hasSessions = library.sessions.length > 0
  const [mode, setMode] = useState<LibraryMode>(readSavedLibraryMode)
  const [sortPreferences, setSortPreferences] = useState<LibrarySortPreferences>(readSavedSortPreferences)
  const [posterNotice, setPosterNotice] = useState<PosterNotice | null>(null)
  const movieCount = useMemo(
    () => groupSessionsByMovie(library.sessions, 'date-added', library.reactors).length,
    [library.sessions, library.reactors]
  )
  const sort = sortPreferences[mode]

  const runPosterAction = async (
    action: () => Promise<MoviePosterActionResult>
  ): Promise<void> => {
    setPosterNotice(null)
    try {
      const result = await action()
      const nextNotice = noticeForPosterResult(result)
      if (nextNotice) setPosterNotice(nextNotice)
    } catch {
      // Action hooks normally convert IPC failures into a result. Keep this
      // boundary defensive so a future implementation cannot leak a rejected
      // library action into the renderer.
      setPosterNotice({
        kind: 'error',
        message: 'WatchAlong couldn’t update that poster. Your current movie art is unchanged.'
      })
    }
  }

  const choosePoster = (sessionId: string): void => {
    void runPosterAction(() => onChoosePoster(sessionId))
  }

  const clearPoster = (sessionId: string): void => {
    void runPosterAction(() => onClearPoster(sessionId))
  }

  useEffect(() => {
    try {
      window.localStorage.setItem('watchalong-library-mode', mode)
    } catch {
      // A locked-down renderer can still use the in-memory view toggle.
    }
  }, [mode])

  useEffect(() => {
    try {
      window.localStorage.setItem('watchalong-library-sorts', JSON.stringify(sortPreferences))
    } catch {
      // Sorting remains available for this run when storage is unavailable.
    }
  }, [sortPreferences])

  const changeSort = (nextSort: LibrarySort): void => {
    setSortPreferences((current) => current[mode] === nextSort
      ? current
      : { ...current, [mode]: nextSort })
  }

  return (
    <section
      className={`library-home library-home-${view} library-mode-${mode}`}
      aria-label="WatchAlong Library"
    >
      <header className="library-home-header">
        <div className="library-home-brand">
          <span className="library-home-mark" aria-hidden>
            <Film size={24} />
          </span>
          <div>
            <h1>WatchAlong</h1>
            {hasSessions && <p>{librarySummary(movieCount, library.sessions.length)}</p>}
          </div>
        </div>
        <div className="library-header-actions">
          <div className="library-mode-switch" role="group" aria-label="Organize library">
            <LibraryModeButton active={mode === 'pairings'} icon={<LayoutGrid size={16} />} label="Pairings" onClick={() => setMode('pairings')} />
            <LibraryModeButton active={mode === 'reactors'} icon={<UsersRound size={16} />} label="By Reactor" onClick={() => setMode('reactors')} />
            <LibraryModeButton active={mode === 'movies'} icon={<Clapperboard size={16} />} label="By Movie" onClick={() => setMode('movies')} />
          </div>
          <div className="library-layout-switch" role="group" aria-label="Library layout">
            <LibraryModeButton active={view === 'grid'} icon={<Grid2X2 size={16} />} label="Posters" onClick={() => onViewChange('grid')} />
            <LibraryModeButton active={view === 'list'} icon={<Rows3 size={17} />} label="List" onClick={() => onViewChange('list')} />
          </div>
          <button className="primary-button" type="button" onClick={onNew}>
            <Plus size={18} aria-hidden />
            New WatchAlong
          </button>
          <button
            className="icon-button library-fullscreen-button"
            type="button"
            title={`${fullscreenActive ? 'Exit fullscreen' : 'Fullscreen'} (Alt+Enter)`}
            aria-label={fullscreenActive ? 'Exit fullscreen' : 'Fullscreen'}
            aria-keyshortcuts="Alt+Enter"
            aria-pressed={fullscreenActive}
            onClick={onToggleFullscreen}
          >
            {fullscreenActive ? <Minimize size={18} aria-hidden /> : <Maximize size={18} aria-hidden />}
          </button>
          <button
            className="icon-button library-command-panel-button"
            type="button"
            title="Command Panel"
            aria-label="Command Panel"
            onClick={onOpenCommandPanel}
          >
            <Settings size={18} aria-hidden />
          </button>
        </div>
      </header>

      {posterNotice && (
        <div
          className={`library-poster-notice library-poster-notice-${posterNotice.kind}`}
          role={posterNotice.kind === 'error' ? 'alert' : 'status'}
        >
          {posterNotice.kind === 'error'
            ? <TriangleAlert size={16} aria-hidden />
            : <Check size={16} aria-hidden />}
          <span>{posterNotice.message}</span>
        </div>
      )}

      <div className="library-browser">
        <LibrarySortControl mode={mode} sort={sort} onSortChange={changeSort} />

        {!hasSessions && <LibraryEmptyState mode={mode} onNew={onNew} />}

        {hasSessions && mode === 'pairings' && (
          <PairingLibraryView
            sessions={library.sessions}
            reactors={library.reactors}
            sort={sort}
            compact={view === 'list'}
            onOpenSession={onOpenSession}
            onChoosePoster={choosePoster}
            onClearPoster={clearPoster}
            onRename={onRename}
            onEditReactor={onEditReactor}
            onDelete={onDelete}
          />
        )}

        {hasSessions && mode === 'reactors' && (
          <ReactorLibraryView
            sessions={library.sessions}
            reactors={library.reactors}
            sort={sort}
            compact={view === 'list'}
            onOpenSession={onOpenSession}
            onChoosePoster={choosePoster}
            onClearPoster={clearPoster}
            onRename={onRename}
            onEditReactor={onEditReactor}
            onDelete={onDelete}
          />
        )}

        {hasSessions && mode === 'movies' && (
          <MovieLibraryView
            sessions={library.sessions}
            reactors={library.reactors}
            sort={sort}
            compact={view === 'list'}
            onOpenSession={onOpenSession}
            onChoosePoster={choosePoster}
            onClearPoster={clearPoster}
            onRename={onRename}
            onEditReactor={onEditReactor}
            onDelete={onDelete}
          />
        )}
      </div>
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

function librarySummary(movieCount: number, pairingTotal: number): string {
  return `${movieCount} ${movieCount === 1 ? 'movie' : 'movies'} · ${pairingTotal} ${pairingTotal === 1 ? 'pairing' : 'pairings'}`
}

interface PosterNotice {
  kind: 'success' | 'error'
  message: string
}

function noticeForPosterResult(result: MoviePosterActionResult): PosterNotice | null {
  switch (result.status) {
    case 'chosen':
      return { kind: 'success', message: 'Poster selected for this movie.' }
    case 'cleared':
      return { kind: 'success', message: 'Automatic local poster restored.' }
    case 'error':
      return result.action === 'choose'
        ? { kind: 'error', message: 'WatchAlong couldn’t save that poster. Your current movie art is unchanged.' }
        : { kind: 'error', message: 'WatchAlong couldn’t restore automatic poster art. Your current movie art is unchanged.' }
    case 'cancelled':
      return null
  }
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

type LibrarySortPreferences = Record<LibraryMode, LibrarySort>

const defaultSortPreferences: LibrarySortPreferences = {
  pairings: 'date-added',
  reactors: 'date-added',
  movies: 'date-added'
}

function readSavedSortPreferences(): LibrarySortPreferences {
  try {
    const saved = JSON.parse(window.localStorage.getItem('watchalong-library-sorts') ?? '{}') as Partial<Record<LibraryMode, unknown>>
    return {
      pairings: normalizeLibrarySort(saved.pairings),
      reactors: normalizeLibrarySort(saved.reactors),
      movies: normalizeLibrarySort(saved.movies)
    }
  } catch {
    return { ...defaultSortPreferences }
  }
}

function normalizeLibrarySort(value: unknown): LibrarySort {
  return value === 'alphabetical' || value === 'date-added' ? value : 'date-added'
}

