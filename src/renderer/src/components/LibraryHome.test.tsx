import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultSession } from '@shared/session'
import type { LibrarySession, LibraryViewPreference, SessionLibrary } from '@shared/types'
import type { MoviePosterActionResult } from '../moviePosterActions'
import { LibraryHome } from './LibraryHome'

describe('LibraryHome', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('organizes the same local sessions as pairings, reactors, or movies', () => {
    const onOpenSession = vi.fn()
    const { container } = renderLibrary(onOpenSession)

    const pairings = screen.getByRole('button', { name: 'Pairings' })
    const reactors = screen.getByRole('button', { name: 'By Reactor' })
    const movies = screen.getByRole('button', { name: 'By Movie' })
    expect(pairings).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('2 movies · 2 pairings')).toBeInTheDocument()
    expect(container.querySelectorAll('.pairing-library-grid .movie-poster-card')).toHaveLength(2)
    expect(container.querySelectorAll('.library-card-reactor-badge')).toHaveLength(2)
    expect(screen.queryByText('Your local film shelf')).not.toBeInTheDocument()

    fireEvent.click(reactors)
    expect(reactors).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'VKunia' })).toBeInTheDocument()
    expect(screen.getByText('2 pairings')).toBeInTheDocument()
    expect(container.querySelectorAll('.movie-poster-card')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'More actions for Alien with VKunia' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Alien with VKunia: 25% watched' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open Alien with VKunia' }))
    expect(onOpenSession).toHaveBeenCalledWith('alien')

    fireEvent.click(movies)
    expect(movies).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'Anchorman' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open VKunia for Alien' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open VKunia for Anchorman' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More actions for VKunia for Alien' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More actions for VKunia for Anchorman' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'VKunia for Alien: 25% watched' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'VKunia for Anchorman: 25% watched' })).toBeInTheDocument()
  })

  it('shows one prominent poster per movie group and keeps its title fallback after an image failure', () => {
    window.localStorage.setItem('watchalong-library-mode', 'movies')
    const automatic = session('automatic', 'Anchorman — First Reactor', 'Anchorman.mp4', 'first - First Reactor')
    const manual = session('manual', 'Anchorman — Second Reactor', 'Anchorman.mp4', 'second - Second Reactor')
    manual.moviePosterPath = 'C:\\Art\\anchorman-custom.png'
    const library: SessionLibrary = {
      version: 5,
      activeSessionId: automatic.id,
      sessions: [automatic, manual]
    }

    const { container } = renderLibrary(vi.fn(), { library })
    const heading = screen.getByRole('heading', { name: 'Anchorman' })
    const movieGroup = heading.closest('.movie-shelf-card')
    expect(movieGroup).not.toBeNull()
    expect(movieGroup?.querySelectorAll('.movie-poster-group')).toHaveLength(1)

    const poster = movieGroup?.querySelector('.movie-poster-group img')
    expect(poster).toHaveAttribute(
      'src',
      `watchalong://media/manual/movie-poster?v=${encodeURIComponent(manual.updatedAt)}`
    )
    expect(movieGroup?.querySelector('.movie-poster-title')).toHaveTextContent('Anchorman')

    fireEvent.error(poster as HTMLImageElement)
    expect(movieGroup?.querySelector('.movie-poster-group img')).toBeNull()
    expect(movieGroup?.querySelector('.movie-poster-title')).toHaveTextContent('Anchorman')
    expect(container.querySelectorAll('.reactor-avatar-card')).toHaveLength(2)
  })

  it('offers poster selection, confirms it, and returns to automatic art from the card menu', async () => {
    const onChoosePoster = vi.fn(async (): Promise<MoviePosterActionResult> => ({ status: 'chosen' }))
    const onClearPoster = vi.fn(async (): Promise<MoviePosterActionResult> => ({ status: 'cleared' }))
    const withManualPoster = session('alien', 'Alien — VKunia', 'Alien.mkv', 'vkunia - VKunia')
    withManualPoster.moviePosterPath = 'C:\\Art\\alien.jpg'
    const library: SessionLibrary = {
      version: 5,
      activeSessionId: withManualPoster.id,
      sessions: [withManualPoster]
    }
    renderLibrary(vi.fn(), { library, onChoosePoster, onClearPoster })

    const actions = screen.getByRole('button', { name: 'More actions for Alien — VKunia' })
    fireEvent.click(actions)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Choose poster…' }))
    expect(onChoosePoster).toHaveBeenCalledWith('alien')
    expect(await screen.findByRole('status')).toHaveTextContent('Poster selected for this movie.')

    fireEvent.click(actions)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Use automatic poster' }))
    expect(onClearPoster).toHaveBeenCalledWith('alien')
    expect(await screen.findByRole('status')).toHaveTextContent('Automatic local poster restored.')
  })

  it('keeps a cancelled poster picker quiet', async () => {
    const onChoosePoster = vi.fn(async (): Promise<MoviePosterActionResult> => ({ status: 'cancelled' }))
    renderLibrary(vi.fn(), { onChoosePoster })

    fireEvent.click(screen.getByRole('button', { name: 'More actions for Alien — VKunia' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Choose poster…' }))
    await waitFor(() => expect(onChoosePoster).toHaveBeenCalledWith('alien'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('provides unique action labels and falls back cleanly when an avatar is unavailable', () => {
    const { container } = renderLibrary(vi.fn())
    expect(screen.getByRole('button', { name: 'More actions for Alien — VKunia' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More actions for Anchorman — VKnights' })).toBeInTheDocument()

    const image = container.querySelector('.reactor-avatar img')
    expect(image).not.toBeNull()
    fireEvent.error(image as HTMLImageElement)
    // The fallback remains visible while the failed image is removed before
    // its delayed retry, avoiding Chromium's broken-image glyph.
    expect(container.querySelectorAll('.reactor-avatar-fallback').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('.reactor-avatar img')).toHaveLength(1)
  })

  it('dismisses a card action menu with Escape and restores focus to its trigger', async () => {
    renderLibrary(vi.fn())
    const trigger = screen.getByRole('button', { name: 'More actions for Alien — VKunia' })
    fireEvent.click(trigger)

    expect(screen.getByRole('menu', { name: 'Actions for Alien — VKunia' })).toBeInTheDocument()
    const firstAction = screen.getByRole('menuitem', { name: 'Choose poster…' })
    expect(firstAction).toHaveFocus()
    fireEvent.keyDown(firstAction, { key: 'ArrowDown' })
    const renameAction = screen.getByRole('menuitem', { name: 'Rename' })
    expect(renameAction).toHaveFocus()
    fireEvent.keyDown(renameAction, { key: 'Escape' })

    expect(screen.queryByRole('menu', { name: 'Actions for Alien — VKunia' })).not.toBeInTheDocument()
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('opens a lower card menu upward so the library scrollport does not clip it', () => {
    const { container } = renderLibrary(vi.fn())
    const browser = container.querySelector('.library-browser') as HTMLDivElement
    const trigger = screen.getByRole('button', { name: 'More actions for Alien — VKunia' })
    vi.spyOn(browser, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 500 } as DOMRect)
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({ top: 420, bottom: 464 } as DOMRect)

    fireEvent.click(trigger)

    expect(screen.getByRole('menu', { name: 'Actions for Alien — VKunia' })).toHaveClass('library-card-menu-up')
  })

  it('remembers the chosen organization locally without changing the library model', () => {
    const first = renderLibrary(vi.fn())
    fireEvent.click(screen.getByRole('button', { name: 'By Movie' }))
    first.unmount()

    renderLibrary(vi.fn())
    expect(screen.getByRole('button', { name: 'By Movie' })).toHaveAttribute('aria-pressed', 'true')
  })

  it.each([
    ['pairings', 'Pairings', '.pairing-library-grid-compact'],
    ['reactors', 'By Reactor', '.reactor-library-compact'],
    ['movies', 'By Movie', '.movie-library-grid-compact']
  ] as const)('honors the saved List preference in %s mode', (mode, modeLabel, compactSelector) => {
    window.localStorage.setItem('watchalong-library-mode', mode)

    const { container } = renderLibrary(vi.fn(), { view: 'list' })

    expect(screen.getByRole('button', { name: modeLabel })).toHaveAttribute('aria-pressed', 'true')
    expect(container.querySelector('.library-home-list')).not.toBeNull()
    expect(container.querySelector(compactSelector)).not.toBeNull()
    const cards = [...container.querySelectorAll('.library-card')]
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.every((card) => card.classList.contains('library-card-compact'))).toBe(true)
  })

  it('exposes the saved layout and requests layout changes from the library header', () => {
    const onViewChange = vi.fn()
    const first = renderLibrary(vi.fn(), { onViewChange })

    expect(screen.getByRole('button', { name: 'Posters' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(onViewChange).toHaveBeenCalledWith('list')

    first.unmount()
    renderLibrary(vi.fn(), { view: 'list', onViewChange })
    expect(screen.getByRole('button', { name: 'Posters' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Posters' }))
    expect(onViewChange).toHaveBeenLastCalledWith('grid')
  })
})

function renderLibrary(
  onOpenSession: (sessionId: string) => void,
  options: {
    library?: SessionLibrary
    view?: LibraryViewPreference
    onViewChange?: (view: LibraryViewPreference) => void
    onChoosePoster?: (sessionId: string) => Promise<MoviePosterActionResult>
    onClearPoster?: (sessionId: string) => Promise<MoviePosterActionResult>
  } = {}
) {
  const library: SessionLibrary = options.library ?? {
    version: 5,
    activeSessionId: 'alien',
    sessions: [
      session('alien', 'Alien — VKunia', 'Alien.mkv', 'vkunia - VKunia'),
      session('anchorman', 'Anchorman — VKnights', 'Anchorman.mp4', 'vkunia - VKunia')
    ]
  }

  return render(
    <LibraryHome
      library={library}
      view={options.view ?? 'grid'}
      onViewChange={options.onViewChange ?? vi.fn()}
      onNew={vi.fn()}
      onOpenSession={onOpenSession}
      onChoosePoster={options.onChoosePoster ?? vi.fn(async () => ({ status: 'cancelled' as const }))}
      onClearPoster={options.onClearPoster ?? vi.fn(async () => ({ status: 'cancelled' as const }))}
      onRename={vi.fn()}
      onDelete={vi.fn()}
    />
  )
}

function session(id: string, title: string, movieName: string, campaign: string): LibrarySession {
  return createDefaultSession(new Date('2026-07-13T12:00:00.000Z'), {
    id,
    title,
    moviePath: `C:\\Movies\\${movieName}`,
    reactionPath: `C:\\Reactions\\patreon\\${id}\\${campaign}\\posts\\10 - Post\\video\\reaction.mp4`,
    reactionSource: 'patreon',
    reactionDurationSeconds: 100,
    lastReactionTimeSeconds: 25
  })
}
