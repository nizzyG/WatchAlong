import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import type { LibrarySession, SessionLibrary, WatchAlongApi } from '@shared/types'

const firstSession = createSession('s1', 'First', 0)
const secondSession = createSession('s2', 'Second', 20)

function createLibrary(activeSessionId = 's1', sessions: LibrarySession[] = [firstSession, secondSession]): SessionLibrary {
  return {
    version: 2,
    activeSessionId,
    sessions
  }
}

function createApi(library = createLibrary()): WatchAlongApi {
  let currentLibrary = library

  return {
    openVideos: vi.fn(),
    getLibrary: vi.fn(async () => currentLibrary),
    saveActiveSession: vi.fn(async (patch) => {
      currentLibrary = {
        ...currentLibrary,
        sessions: currentLibrary.sessions.map((session) =>
          session.id === currentLibrary.activeSessionId ? { ...session, ...patch } : session
        )
      }
      return currentLibrary
    }),
    setActiveSession: vi.fn(async (sessionId: string) => {
      currentLibrary = { ...currentLibrary, activeSessionId: sessionId }
      return currentLibrary
    }),
    deleteSession: vi.fn(async () => currentLibrary),
    renameSession: vi.fn(async () => currentLibrary),
    openSubtitle: vi.fn(),
    clearSubtitle: vi.fn(async () => currentLibrary),
    getSubtitleText: vi.fn(),
    getMediaUrl: vi.fn(async (role, sessionId) => `watchalong://media/${sessionId}/${role}`)
  }
}

describe('App', () => {
  let playMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    playMock = vi.fn(async () => undefined)
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: playMock
    })
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      configurable: true,
      value: vi.fn()
    })
    Object.defineProperty(HTMLMediaElement.prototype, 'duration', {
      configurable: true,
      get: () => 120
    })
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
      configurable: true,
      get: () => 4
    })
  })

  it('loads media URLs for the active library session and switches sessions', async () => {
    const api = createApi()
    window.watchAlong = api

    render(<App />)

    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    expect(api.getMediaUrl).toHaveBeenCalledWith('movie', 's1')

    fireEvent.click(screen.getByRole('button', { name: /Second/ }))

    await waitFor(() => expect(api.setActiveSession).toHaveBeenCalledWith('s2'))
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's2'))
    expect(api.getMediaUrl).toHaveBeenCalledWith('movie', 's2')
  })

  it('handles mute and offset keyboard shortcuts', async () => {
    const api = createApi()
    window.watchAlong = api

    render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))

    fireEvent.keyDown(window, { code: 'KeyR' })
    await waitFor(() => expect(api.saveActiveSession).toHaveBeenCalledWith({ isReactionMuted: true }))

    fireEvent.keyDown(window, { code: 'BracketRight' })
    await waitFor(() => expect(api.saveActiveSession).toHaveBeenCalledWith({ offsetSeconds: 0.1 }))
  })

  it('attaches sync playback after media elements render', async () => {
    const api = createApi()
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))

    fireEvent.loadedMetadata(container.querySelector('video.reaction-video')!)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)
    fireEvent.click(screen.getByLabelText('Play'))

    await waitFor(() => expect(playMock).toHaveBeenCalledTimes(2))
  })

  it('preserves the current sync point when changing movie source rate', async () => {
    const session = createSession('s1', 'First', 0, { offsetSeconds: 5 })
    const api = createApi(createLibrary('s1', [session]))
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    const reaction = container.querySelector('video.reaction-video') as HTMLVideoElement
    reaction.currentTime = 100

    fireEvent.click(screen.getByRole('button', { name: 'Stream 24 -> Blu-ray 23.976' }))

    await waitFor(() =>
      expect(api.saveActiveSession).toHaveBeenCalledWith({
        movieRateCorrection: 1.001,
        offsetSeconds: 4.9
      })
    )
  })
})

function createSession(
  id: string,
  title: string,
  lastReactionTimeSeconds: number,
  patch: Partial<LibrarySession> = {}
): LibrarySession {
  return {
    id,
    title,
    reactionPath: `C:\\Videos\\${id}-reaction.mp4`,
    moviePath: `C:\\Videos\\${id}-movie.mp4`,
    subtitlePath: null,
    offsetSeconds: 0,
    lastReactionTimeSeconds,
    overlay: { x: 24, y: 24, width: 420, height: 236 },
    isPipHidden: false,
    reactionVolume: 1,
    movieVolume: 1,
    isReactionMuted: false,
    isMovieMuted: false,
    playbackRate: 1,
    movieRateCorrection: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...patch
  }
}
