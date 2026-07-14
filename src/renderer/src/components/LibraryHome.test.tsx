import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultSession } from '@shared/session'
import type { LibrarySession, SessionLibrary } from '@shared/types'
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

    fireEvent.click(reactors)
    expect(reactors).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'VKunia' })).toBeInTheDocument()
    expect(screen.getByText('2 pairings')).toBeInTheDocument()
    expect(container.querySelectorAll('.movie-poster-card')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Open Alien' }))
    expect(onOpenSession).toHaveBeenCalledWith('alien')

    fireEvent.click(movies)
    expect(movies).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'Anchorman' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Open VKunia' })).toHaveLength(2)
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
    const movieGroup = heading.closest('.library-group')
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
    fireEvent.click(screen.getByRole('button', { name: 'Choose poster…' }))
    expect(onChoosePoster).toHaveBeenCalledWith('alien')
    expect(await screen.findByRole('status')).toHaveTextContent('Poster selected for this movie.')

    fireEvent.click(actions)
    fireEvent.click(screen.getByRole('button', { name: 'Use automatic poster' }))
    expect(onClearPoster).toHaveBeenCalledWith('alien')
    expect(await screen.findByRole('status')).toHaveTextContent('Automatic local poster restored.')
  })

  it('keeps a cancelled poster picker quiet', async () => {
    const onChoosePoster = vi.fn(async (): Promise<MoviePosterActionResult> => ({ status: 'cancelled' }))
    renderLibrary(vi.fn(), { onChoosePoster })

    fireEvent.click(screen.getByRole('button', { name: 'More actions for Alien — VKunia' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose poster…' }))
    await waitFor(() => expect(onChoosePoster).toHaveBeenCalledWith('alien'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('provides unique action labels and falls back cleanly when an avatar is unavailable', () => {
    const { container } = renderLibrary(vi.fn())
    expect(screen.getByRole('button', { name: 'More actions for Alien — VKunia' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More actions for Anchorman — VKnights' })).toBeInTheDocument()

    const image = container.querySelector('img')
    expect(image).not.toBeNull()
    fireEvent.error(image as HTMLImageElement)
    // The fallback is always present, and the image retries briefly because
    // YouTube creator art may finish just after the download handoff.
    expect(container.querySelectorAll('.reactor-avatar-fallback').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('img')).toHaveLength(2)
  })

  it('remembers the chosen organization locally without changing the library model', () => {
    const first = renderLibrary(vi.fn())
    fireEvent.click(screen.getByRole('button', { name: 'By Movie' }))
    first.unmount()

    renderLibrary(vi.fn())
    expect(screen.getByRole('button', { name: 'By Movie' })).toHaveAttribute('aria-pressed', 'true')
  })
})

function renderLibrary(
  onOpenSession: (sessionId: string) => void,
  options: {
    library?: SessionLibrary
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
      view="grid"
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
