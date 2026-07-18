import { Clapperboard, LayoutGrid, Plus, UsersRound } from 'lucide-react'
import type { RefObject } from 'react'
import type { LibraryMode } from './libraryPresentation'

const emptyStateContent = {
  pairings: {
    icon: LayoutGrid,
    title: 'No WatchAlong pairings yet',
    message: 'Choose a movie and a reaction to create a pairing. Your files and playback settings stay on this computer.'
  },
  reactors: {
    icon: UsersRound,
    title: 'No reactors to browse yet',
    message: 'Reactor shelves appear automatically when you create a pairing, so every creator and their movies stay together.'
  },
  movies: {
    icon: Clapperboard,
    title: 'No movies to browse yet',
    message: 'Add a pairing and WatchAlong will surface local poster art from your movie folders automatically.'
  }
} satisfies Record<LibraryMode, { icon: typeof LayoutGrid; title: string; message: string }>

export function LibraryEmptyState({
  mode,
  actionRef,
  onNew
}: {
  mode: LibraryMode
  actionRef?: RefObject<HTMLButtonElement>
  onNew(): void
}): JSX.Element {
  const content = emptyStateContent[mode]
  const Icon = content.icon

  return (
    <div className={`library-empty-state library-empty-state-${mode}`} role="region" aria-labelledby={`library-empty-${mode}`}>
      <div className="library-empty-icon" aria-hidden>
        <Icon size={42} />
      </div>
      <h2 id={`library-empty-${mode}`}>{content.title}</h2>
      <p>{content.message}</p>
      <button ref={actionRef} className="primary-button" type="button" onClick={onNew}>
        <Plus size={18} aria-hidden />
        Create a WatchAlong
      </button>
    </div>
  )
}
