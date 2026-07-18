import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultSession } from '@shared/session'
import type { LibrarySession, LibraryViewPreference, SessionLibrary } from '@shared/types'
import type { MoviePosterActionResult } from '../moviePosterActions'
import { LibraryHome } from './LibraryHome'

describe('LibraryHome', () => {
  const scrollIntoView = vi.fn()
  const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')

  beforeEach(() => {
    window.localStorage.clear()
    scrollIntoView.mockClear()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView
    })
  })

  afterEach(() => {
    if (originalScrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView)
    } else {
      delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView
    }
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
    expect(container.querySelectorAll('.reactor-library .movie-poster-card')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'More actions for Alien with VKunia' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Alien with VKunia: 25% watched' })).toBeInTheDocument()
    const inProgressCard = screen.getByRole('button', { name: 'View details for Alien with VKunia' })
    expect(inProgressCard.closest('.library-card')).toHaveClass('library-card-in-progress')
    expect(inProgressCard).toHaveTextContent('Continue · 25%')
    fireEvent.click(inProgressCard)
    expect(onOpenSession).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Alien' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continue Reaction' }))
    expect(onOpenSession).toHaveBeenCalledWith('alien', 'play')

    fireEvent.click(movies)
    expect(movies).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'Anchorman' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View details for VKunia for Alien' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View details for VKunia for Anchorman' })).toBeInTheDocument()
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
      version: 8,
      activeSessionId: automatic.id,
      sessions: [automatic, manual],
      reactors: []
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
      version: 8,
      activeSessionId: withManualPoster.id,
      sessions: [withManualPoster],
      reactors: []
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

  it.each([
    ['pairings', 'Pairings'],
    ['reactors', 'By Reactor'],
    ['movies', 'By Movie']
  ] as const)('keeps the complete card menu and reactor edit action consistent in %s mode', (mode, modeLabel) => {
    window.localStorage.setItem('watchalong-library-mode', mode)
    const alien = session('alien', 'Alien — VKunia', 'Alien.mkv', 'vkunia - VKunia')
    alien.moviePosterPath = 'C:\\Art\\alien.jpg'
    const library: SessionLibrary = { version: 8, activeSessionId: alien.id, sessions: [alien], reactors: [] }
    const onRename = vi.fn()
    const onEditReactor = vi.fn()
    const onDelete = vi.fn()
    renderLibrary(vi.fn(), { library, onRename, onEditReactor, onDelete })

    expect(screen.getByRole('button', { name: modeLabel })).toHaveAttribute('aria-pressed', 'true')
    const trigger = screen.getByRole('button', { name: /More actions for .*Alien|More actions for VKunia for Alien/ })
    fireEvent.click(trigger)
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Rename pairing',
      'Change reactor…',
      'Choose poster…',
      'Use automatic poster',
      'Delete pairing'
    ])

    fireEvent.click(screen.getByRole('menuitem', { name: 'Change reactor…' }))
    expect(onEditReactor).toHaveBeenCalledWith('alien', trigger)
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename pairing' }))
    expect(onRename).toHaveBeenCalledWith('alien', trigger)
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete pairing' }))
    expect(onDelete).toHaveBeenCalledWith('alien', trigger)
  })

  it('dismisses a card action menu with Escape and restores focus to its trigger', async () => {
    renderLibrary(vi.fn())
    const trigger = screen.getByRole('button', { name: 'More actions for Alien — VKunia' })
    fireEvent.click(trigger)

    expect(screen.getByRole('menu', { name: 'Actions for Alien — VKunia' })).toBeInTheDocument()
    const firstAction = screen.getByRole('menuitem', { name: 'Rename pairing' })
    expect(firstAction).toHaveFocus()
    fireEvent.keyDown(firstAction, { key: 'ArrowDown' })
    const reactorAction = screen.getByRole('menuitem', { name: 'Change reactor…' })
    expect(reactorAction).toHaveFocus()
    fireEvent.keyDown(reactorAction, { key: 'Escape' })

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

  it('sorts each view independently, defaults to newest date added, and remembers the choices', () => {
    const alpha = session('alpha', 'Alpha — First Reactor', 'Alpha.mkv', 'first - First Reactor')
    const bravo = session('bravo', 'Bravo — Second Reactor', 'Bravo.mkv', 'second - Second Reactor')
    const zulu = session('zulu', 'Zulu — Third Reactor', 'Zulu.mkv', 'third - Third Reactor')
    alpha.createdAt = '2026-07-12T12:00:00.000Z'
    bravo.createdAt = '2026-07-13T12:00:00.000Z'
    zulu.createdAt = '2026-07-14T12:00:00.000Z'
    const library: SessionLibrary = { version: 8, activeSessionId: zulu.id, sessions: [alpha, zulu, bravo], reactors: [] }

    const first = renderLibrary(vi.fn(), { library })
    const pairingTitles = (): string[] => [...first.container.querySelectorAll('.pairing-library-grid .library-card-copy strong')]
      .map((element) => element.textContent ?? '')

    expect(screen.getByRole('button', { name: 'Date Added' })).toHaveAttribute('aria-pressed', 'true')
    expect(pairingTitles()).toEqual(['Zulu — Third Reactor', 'Bravo — Second Reactor', 'Alpha — First Reactor'])
    fireEvent.click(screen.getByRole('button', { name: 'Alphabetical' }))
    expect(pairingTitles()).toEqual(['Alpha — First Reactor', 'Bravo — Second Reactor', 'Zulu — Third Reactor'])

    fireEvent.click(screen.getByRole('button', { name: 'By Movie' }))
    expect(screen.getByRole('button', { name: 'Date Added' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Pairings' }))
    expect(screen.getByRole('button', { name: 'Alphabetical' })).toHaveAttribute('aria-pressed', 'true')
    first.unmount()

    renderLibrary(vi.fn(), { library })
    expect(screen.getByRole('button', { name: 'Pairings' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Alphabetical' })).toHaveAttribute('aria-pressed', 'true')
    expect(JSON.parse(window.localStorage.getItem('watchalong-library-sorts') ?? '{}')).toEqual({
      pairings: 'alphabetical',
      reactors: 'date-added',
      movies: 'date-added'
    })
  })

  it('provides a welcoming empty state for every organization view', () => {
    const onNew = vi.fn()
    const library: SessionLibrary = { version: 8, activeSessionId: null, sessions: [], reactors: [] }
    renderLibrary(vi.fn(), { library, onNew })

    expect(screen.getByRole('heading', { name: 'No WatchAlong pairings yet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Date Added' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'By Reactor' }))
    expect(screen.getByRole('heading', { name: 'No reactors to browse yet' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'By Movie' }))
    expect(screen.getByRole('heading', { name: 'No movies to browse yet' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create a WatchAlong' }))
    expect(onNew).toHaveBeenCalledOnce()
  })

  it('uses a balanced shelf treatment for a single reactor pairing', () => {
    window.localStorage.setItem('watchalong-library-mode', 'reactors')
    const onlySession = session('alien', 'Alien — VKunia', 'Alien.mkv', 'vkunia - VKunia')
    const library: SessionLibrary = { version: 8, activeSessionId: onlySession.id, sessions: [onlySession], reactors: [] }

    const { container } = renderLibrary(vi.fn(), { library })

    expect(container.querySelector('.reactor-library')).toHaveClass('reactor-library-single')
    expect(container.querySelector('.reactor-shelf-movies')).toHaveClass('reactor-shelf-movies-single')
    expect(screen.getByRole('button', { name: 'View details for Alien with VKunia' })).toBeInTheDocument()
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

  it('remembers Posters or List independently for each organization mode', () => {
    window.localStorage.setItem('watchalong-library-layouts', JSON.stringify({
      pairings: 'grid',
      reactors: 'grid',
      movies: 'list'
    }))
    const onViewChange = vi.fn()
    const { container } = renderLibrary(vi.fn(), { onViewChange })

    fireEvent.click(screen.getByRole('button', { name: 'By Movie' }))
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true')
    expect(container.querySelector('.movie-library-grid-compact')).not.toBeNull()
    expect(onViewChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Pairings' }))
    expect(screen.getByRole('button', { name: 'Posters' })).toHaveAttribute('aria-pressed', 'true')
    expect(container.querySelector('.pairing-library-grid-compact')).toBeNull()
    expect(onViewChange).not.toHaveBeenCalled()
  })

  it('uses explicit readiness and saved position for the detail primary action', () => {
    const onOpenSession = vi.fn()
    const needsSync = session('needs-sync', 'Alien — VKunia', 'Alien.mkv', 'vkunia - VKunia')
    needsSync.syncReadiness = 'needs-sync'
    const readyFresh = session('ready-fresh', 'Anchorman — VKnights', 'Anchorman.mp4', 'vkunia - VKunia')
    readyFresh.lastReactionTimeSeconds = 0
    const library: SessionLibrary = {
      version: 8,
      activeSessionId: needsSync.id,
      sessions: [needsSync, readyFresh],
      reactors: []
    }
    renderLibrary(onOpenSession, { library })

    fireEvent.click(screen.getByRole('button', { name: 'View details for Alien — VKunia' }))
    fireEvent.click(screen.getByRole('button', { name: 'Find Sync' }))
    expect(onOpenSession).toHaveBeenCalledWith('needs-sync', 'sync')

    fireEvent.click(screen.getByRole('button', { name: 'Back to library' }))
    fireEvent.click(screen.getByRole('button', { name: 'View details for Anchorman — VKnights' }))
    fireEvent.click(screen.getByRole('button', { name: 'Play Reaction' }))
    expect(onOpenSession).toHaveBeenLastCalledWith('ready-fresh', 'play')
  })

  it('focuses the first sorted pairing without jumping to the active row, supports Escape, and restores card focus', async () => {
    const alien = session('alien', 'Alien — VKunia', 'Alien.mkv', 'vkunia - VKunia')
    const anchorman = session('anchorman', 'Anchorman — VKnights', 'Anchorman.mp4', 'vkunia - VKunia')
    const library: SessionLibrary = {
      version: 8,
      activeSessionId: 'anchorman',
      // Storage order intentionally differs from the visible alphabetical
      // order so focus follows the shelf, not the raw session array.
      sessions: [anchorman, alien],
      reactors: []
    }
    renderLibrary(vi.fn(), { library })
    const firstCard = screen.getByRole('button', { name: 'View details for Alien — VKunia' })
    await waitFor(() => expect(firstCard).toHaveFocus())
    expect(scrollIntoView).not.toHaveBeenCalled()

    fireEvent.click(firstCard)
    const back = screen.getByRole('button', { name: 'Back to library' })
    await waitFor(() => expect(back).toHaveFocus())
    fireEvent.keyDown(back, { key: 'Escape' })

    await waitFor(() => expect(screen.getByRole('button', { name: 'View details for Alien — VKunia' })).toHaveFocus())
  })

  it('reveals the remembered card after organization or layout regrouping', async () => {
    renderLibrary(vi.fn())
    const rememberedCard = screen.getByRole('button', { name: 'View details for Anchorman — VKnights' })
    rememberedCard.focus()
    scrollIntoView.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'By Reactor' }))
    const regroupedCard = screen.getByRole('button', { name: 'View details for Anchorman with VKunia' })
    await waitFor(() => expect(regroupedCard).toHaveFocus())
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest', inline: 'nearest' })

    scrollIntoView.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'View details for Anchorman with VKunia' })).toHaveFocus())
    await waitFor(() => expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest', inline: 'nearest' }))
  })

  it('recovers to the nearest visible card when the focused pairing is deleted', async () => {
    const alien = session('alien', 'Alien — VKunia', 'Alien.mkv', 'vkunia - VKunia')
    const anchorman = session('anchorman', 'Anchorman — VKnights', 'Anchorman.mp4', 'vkunia - VKunia')
    const tombstone = session('tombstone', 'Tombstone — Shanelle', 'Tombstone.mp4', 'shanelle - Shanelle')
    const library: SessionLibrary = {
      version: 8,
      activeSessionId: alien.id,
      sessions: [alien, anchorman, tombstone],
      reactors: []
    }
    const view = renderLibrary(vi.fn(), { library })
    const deletedCardActions = screen.getByRole('button', { name: 'More actions for Anchorman — VKnights' })
    deletedCardActions.focus()

    view.rerenderLibrary({ ...library, sessions: [alien, tombstone] })

    await waitFor(() => expect(screen.getByRole('button', { name: 'View details for Tombstone — Shanelle' })).toHaveFocus())
  })

  it('does not steal focus from an open card menu when the library mutates', async () => {
    const alien = session('alien', 'Alien — VKunia', 'Alien.mkv', 'vkunia - VKunia')
    const anchorman = session('anchorman', 'Anchorman — VKnights', 'Anchorman.mp4', 'vkunia - VKunia')
    const library: SessionLibrary = {
      version: 8,
      activeSessionId: alien.id,
      sessions: [alien, anchorman],
      reactors: []
    }
    const view = renderLibrary(vi.fn(), { library })
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Alien — VKunia' }))
    const menuItem = screen.getByRole('menuitem', { name: 'Rename pairing' })
    await waitFor(() => expect(menuItem).toHaveFocus())

    const tombstone = session('tombstone', 'Tombstone — Shanelle', 'Tombstone.mp4', 'shanelle - Shanelle')
    view.rerenderLibrary({ ...library, sessions: [alien, anchorman, tombstone] })
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 40))
    })

    expect(menuItem).toHaveFocus()
  })

  it('returns from detail with Escape or BrowserBack even when focus is in the persistent header', async () => {
    renderLibrary(vi.fn())
    const card = screen.getByRole('button', { name: 'View details for Alien — VKunia' })
    fireEvent.click(card)

    const headerMode = screen.getByRole('button', { name: 'Pairings' })
    headerMode.focus()
    fireEvent.keyDown(headerMode, { key: 'Escape' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'View details for Alien — VKunia' })).toHaveFocus())

    fireEvent.click(screen.getByRole('button', { name: 'View details for Alien — VKunia' }))
    headerMode.focus()
    fireEvent.keyDown(headerMode, { key: 'BrowserBack' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'View details for Alien — VKunia' })).toHaveFocus())
  })

  it('focuses the creation action when the library has no cards', async () => {
    const library: SessionLibrary = { version: 8, activeSessionId: null, sessions: [], reactors: [] }
    renderLibrary(vi.fn(), { library })

    await waitFor(() => expect(screen.getByRole('button', { name: 'Create a WatchAlong' })).toHaveFocus())
  })

  it('exposes a stateful fullscreen control with the standard shortcut hint', () => {
    const onToggleFullscreen = vi.fn()
    const first = renderLibrary(vi.fn(), { onToggleFullscreen })

    const enterButton = screen.getByRole('button', { name: 'Fullscreen' })
    expect(enterButton).toHaveAttribute('aria-keyshortcuts', 'Alt+Enter')
    expect(enterButton).toHaveAttribute('aria-pressed', 'false')
    expect(enterButton).toHaveAttribute('title', 'Fullscreen (Alt+Enter)')
    fireEvent.click(enterButton)
    expect(onToggleFullscreen).toHaveBeenCalledOnce()

    first.unmount()
    renderLibrary(vi.fn(), { fullscreenActive: true, onToggleFullscreen })
    expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toHaveAttribute('aria-pressed', 'true')
  })
})

function renderLibrary(
  onOpenSession: (sessionId: string, intent: 'play' | 'sync') => void,
  options: {
    library?: SessionLibrary
    view?: LibraryViewPreference
    onViewChange?: (view: LibraryViewPreference) => void
    fullscreenActive?: boolean
    onToggleFullscreen?: () => void
    onNew?: () => void
    onChoosePoster?: (sessionId: string) => Promise<MoviePosterActionResult>
    onClearPoster?: (sessionId: string) => Promise<MoviePosterActionResult>
    onRename?: (sessionId: string) => void
    onEditReactor?: (sessionId: string) => void
    onDelete?: (sessionId: string) => void
  } = {}
) {
  const library: SessionLibrary = options.library ?? {
    version: 8,
    activeSessionId: 'alien',
    sessions: [
      session('alien', 'Alien — VKunia', 'Alien.mkv', 'vkunia - VKunia'),
      session('anchorman', 'Anchorman — VKnights', 'Anchorman.mp4', 'vkunia - VKunia')
    ],
    reactors: []
  }

  const renderHome = (nextLibrary: SessionLibrary) => (
    <LibraryHome
      library={nextLibrary}
      view={options.view ?? 'grid'}
      onViewChange={options.onViewChange ?? vi.fn()}
      fullscreenActive={options.fullscreenActive ?? false}
      onToggleFullscreen={options.onToggleFullscreen ?? vi.fn()}
      onOpenCommandPanel={vi.fn()}
      onNew={options.onNew ?? vi.fn()}
      onOpenSession={onOpenSession}
      onChoosePoster={options.onChoosePoster ?? vi.fn(async () => ({ status: 'cancelled' as const }))}
      onClearPoster={options.onClearPoster ?? vi.fn(async () => ({ status: 'cancelled' as const }))}
      onRename={options.onRename ?? vi.fn()}
      onEditReactor={options.onEditReactor ?? vi.fn()}
      onDelete={options.onDelete ?? vi.fn()}
    />
  )
  const result = render(renderHome(library))

  return {
    ...result,
    rerenderLibrary(nextLibrary: SessionLibrary): void {
      result.rerender(renderHome(nextLibrary))
    }
  }
}

function session(id: string, title: string, movieName: string, campaign: string): LibrarySession {
  return createDefaultSession(new Date('2026-07-13T12:00:00.000Z'), {
    id,
    title,
    moviePath: `C:\\Movies\\${movieName}`,
    reactionPath: `C:\\Reactions\\patreon\\${id}\\${campaign}\\posts\\10 - Post\\video\\reaction.mp4`,
    reactionSource: 'patreon',
    reactionDurationSeconds: 100,
    lastReactionTimeSeconds: 25,
    syncReadiness: 'ready'
  })
}
