import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultSession } from '@shared/session'
import type { LibrarySession, SessionLibrary } from '@shared/types'
import { LibraryHome } from './LibraryHome'

describe('LibraryHome', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('organizes the same local sessions as pairings, reactors, or movies', () => {
    const onOpenSession = vi.fn()
    renderLibrary(onOpenSession)

    const pairings = screen.getByRole('button', { name: 'Pairings' })
    const reactors = screen.getByRole('button', { name: 'By Reactor' })
    const movies = screen.getByRole('button', { name: 'By Movie' })
    expect(pairings).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(reactors)
    expect(reactors).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'VKunia' })).toBeInTheDocument()
    expect(screen.getByText('2 pairings')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open Alien' }))
    expect(onOpenSession).toHaveBeenCalledWith('alien')

    fireEvent.click(movies)
    expect(movies).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'Anchorman' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Open VKunia' })).toHaveLength(2)
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

function renderLibrary(onOpenSession: (sessionId: string) => void) {
  const library: SessionLibrary = {
    version: 4,
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
