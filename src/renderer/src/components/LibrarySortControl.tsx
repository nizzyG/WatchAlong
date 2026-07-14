import type { LibraryMode, LibrarySort } from './libraryPresentation'

const modeLabels: Record<LibraryMode, string> = {
  pairings: 'pairings',
  reactors: 'reactors',
  movies: 'movies'
}

export function LibrarySortControl({
  mode,
  sort,
  onSortChange
}: {
  mode: LibraryMode
  sort: LibrarySort
  onSortChange(sort: LibrarySort): void
}): JSX.Element {
  return (
    <div className="library-view-toolbar">
      <div className="library-sort-control" role="group" aria-label={`Sort ${modeLabels[mode]}`}>
        <span className="library-sort-label" aria-hidden>Sort</span>
        <button
          type="button"
          aria-pressed={sort === 'date-added'}
          onClick={() => onSortChange('date-added')}
        >
          Date Added
        </button>
        <button
          type="button"
          aria-pressed={sort === 'alphabetical'}
          onClick={() => onSortChange('alphabetical')}
        >
          Alphabetical
        </button>
      </div>
    </div>
  )
}
