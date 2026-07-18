import { useEffect, useState } from 'react'
import type { LibraryViewPreference } from '@shared/types'
import type { LibraryMode, LibrarySort } from '../components/libraryPresentation'

type LayoutPreferences = Record<LibraryMode, LibraryViewPreference>
type SortPreferences = Record<LibraryMode, LibrarySort>

const DEFAULT_SORTS: SortPreferences = {
  pairings: 'date-added',
  reactors: 'date-added',
  movies: 'date-added'
}

export function useLibraryBrowserPreferences(
  preferredView: LibraryViewPreference,
  onViewChange: (view: LibraryViewPreference) => void
) {
  const [mode, setMode] = useState<LibraryMode>(readSavedLibraryMode)
  const [sortPreferences, setSortPreferences] = useState<SortPreferences>(readSavedSortPreferences)
  const [layoutPreferences, setLayoutPreferences] = useState<LayoutPreferences>(
    () => readSavedLayoutPreferences(preferredView)
  )
  const sort = sortPreferences[mode]
  const layout = layoutPreferences[mode]

  useEffect(() => {
    try {
      window.localStorage.setItem('watchalong-library-mode', mode)
    } catch {
      // A locked-down renderer can still use the in-memory organization choice.
    }
  }, [mode])

  useEffect(() => {
    try {
      window.localStorage.setItem('watchalong-library-sorts', JSON.stringify(sortPreferences))
    } catch {
      // Sorting remains available for this run when storage is unavailable.
    }
  }, [sortPreferences])

  useEffect(() => {
    try {
      window.localStorage.setItem('watchalong-library-layouts', JSON.stringify(layoutPreferences))
    } catch {
      // Layout choices remain available for this run when storage is unavailable.
    }
  }, [layoutPreferences])

  const changeMode = (nextMode: LibraryMode): void => {
    if (nextMode === mode) return
    setMode(nextMode)
  }

  const changeSort = (nextSort: LibrarySort): void => {
    setSortPreferences((current) => current[mode] === nextSort
      ? current
      : { ...current, [mode]: nextSort })
  }

  const changeLayout = (nextView: LibraryViewPreference): void => {
    setLayoutPreferences((current) => current[mode] === nextView
      ? current
      : { ...current, [mode]: nextView })
    if (nextView !== preferredView) {
      onViewChange(nextView)
    }
  }

  return { mode, sort, layout, changeMode, changeSort, changeLayout }
}

function readSavedLibraryMode(): LibraryMode {
  try {
    const savedMode = window.localStorage.getItem('watchalong-library-mode')
    if (savedMode === 'reactors' || savedMode === 'movies' || savedMode === 'pairings') return savedMode
  } catch {
    // Use the clearest default when storage is unavailable.
  }
  return 'pairings'
}

function readSavedSortPreferences(): SortPreferences {
  try {
    const saved = JSON.parse(window.localStorage.getItem('watchalong-library-sorts') ?? '{}') as Partial<Record<LibraryMode, unknown>>
    return {
      pairings: normalizeLibrarySort(saved.pairings),
      reactors: normalizeLibrarySort(saved.reactors),
      movies: normalizeLibrarySort(saved.movies)
    }
  } catch {
    return { ...DEFAULT_SORTS }
  }
}

function readSavedLayoutPreferences(fallback: LibraryViewPreference): LayoutPreferences {
  try {
    const saved = JSON.parse(window.localStorage.getItem('watchalong-library-layouts') ?? '{}') as Partial<Record<LibraryMode, unknown>>
    return {
      pairings: normalizeLibraryView(saved.pairings, fallback),
      reactors: normalizeLibraryView(saved.reactors, fallback),
      movies: normalizeLibraryView(saved.movies, fallback)
    }
  } catch {
    return { pairings: fallback, reactors: fallback, movies: fallback }
  }
}

function normalizeLibrarySort(value: unknown): LibrarySort {
  return value === 'alphabetical' || value === 'date-added' ? value : 'date-added'
}

function normalizeLibraryView(value: unknown, fallback: LibraryViewPreference): LibraryViewPreference {
  return value === 'grid' || value === 'list' ? value : fallback
}
