import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import type { AppPreferences, LibrarySession, SessionLibrary, WatchAlongApi, WizardLifecycleCallback } from '@shared/types'

const firstSession = createSession('s1', 'First', 0)
const secondSession = createSession('s2', 'Second', 20)

function createLibrary(activeSessionId: string | null = 's1', sessions: LibrarySession[] = [firstSession, secondSession]): SessionLibrary {
  return {
    version: 2,
    activeSessionId,
    sessions
  }
}

const defaultPreferences: AppPreferences = {
  hasCompletedOnboarding: true,
  openLibraryOnLaunch: true,
  libraryView: 'grid',
  reactionDownloadDirectory: null
}

function createApi(
  library = createLibrary(),
  preferences: AppPreferences = defaultPreferences
): WatchAlongApi & { emitWizardLifecycle(event: Parameters<WizardLifecycleCallback>[0]): void } {
  let currentLibrary = library
  let currentPreferences = preferences
  let wizardLifecycleCallback: WizardLifecycleCallback | null = null

  const api = {
    openVideos: vi.fn(),
    selectMovieFile: vi.fn(async () => ({ path: 'C:\\Movies\\Located movie.mp4', name: 'Located movie.mp4' })),
    selectReactionFile: vi.fn(async () => ({ path: 'C:\\Reactions\\Located reaction.mp4', name: 'Located reaction.mp4' })),
    createOrSwitchSessionFromPaths: vi.fn(async (reactionPath: string, moviePath: string) => {
      currentLibrary = createLibrary('wizard-session', [
        createSession('wizard-session', 'Wizard', 0, { reactionPath, moviePath })
      ])
      return currentLibrary
    }),
    getLibrary: vi.fn(async () => currentLibrary),
    getPreferences: vi.fn(async () => currentPreferences),
    setPreference: vi.fn(async (key: keyof AppPreferences, value: AppPreferences[keyof AppPreferences]) => {
      currentPreferences = { ...currentPreferences, [key]: value }
      return currentPreferences
    }),
    selectDownloadDirectory: vi.fn(async () => 'C:\\Downloads\\WatchAlong'),
    completeOnboarding: vi.fn(async () => {
      currentPreferences = { ...currentPreferences, hasCompletedOnboarding: true }
      return currentPreferences
    }),
    saveActiveSession: vi.fn(async (patch) => {
      currentLibrary = {
        ...currentLibrary,
        sessions: currentLibrary.sessions.map((session) =>
          session.id === currentLibrary.activeSessionId ? { ...session, ...patch } : session
        )
      }
      return currentLibrary
    }),
    replaceSessionMedia: vi.fn(async (sessionId, role, path, reactionSource) => {
      currentLibrary = {
        ...currentLibrary,
        activeSessionId: sessionId,
        sessions: currentLibrary.sessions.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                ...(role === 'movie' ? { moviePath: path } : { reactionPath: path, reactionSource: reactionSource ?? session.reactionSource })
              }
            : session
        )
      }
      return currentLibrary
    }),
    setSessionMedia: vi.fn(async (role, path, reactionSource) => {
      currentLibrary = {
        ...currentLibrary,
        sessions: currentLibrary.sessions.map((session) =>
          session.id === currentLibrary.activeSessionId
            ? {
                ...session,
                ...(role === 'movie' ? { moviePath: path } : { reactionPath: path, reactionSource: reactionSource ?? session.reactionSource })
              }
            : session
        )
      }
      return currentLibrary
    }),
    setActiveSession: vi.fn(async (sessionId: string) => {
      currentLibrary = { ...currentLibrary, activeSessionId: sessionId }
      return currentLibrary
    }),
    deleteSession: vi.fn(async (sessionId: string) => {
      const sessions = currentLibrary.sessions.filter((session) => session.id !== sessionId)
      currentLibrary = {
        ...currentLibrary,
        sessions,
        activeSessionId: currentLibrary.activeSessionId === sessionId ? sessions[0]?.id ?? null : currentLibrary.activeSessionId
      }
      return currentLibrary
    }),
    renameSession: vi.fn(async (sessionId: string, title: string) => {
      currentLibrary = {
        ...currentLibrary,
        sessions: currentLibrary.sessions.map((session) => (session.id === sessionId ? { ...session, title } : session))
      }
      return currentLibrary
    }),
    openSubtitle: vi.fn(),
    clearSubtitle: vi.fn(async () => currentLibrary),
    getSubtitleText: vi.fn(),
    getMediaUrl: vi.fn(async (role, sessionId) => `watchalong://media/${sessionId}/${role}`),
    checkTools: vi.fn(async () => ({ ready: true, tools: [] })),
    detectBrowsers: vi.fn(async () => []),
    extractPatreonSession: vi.fn(async () => ({ ok: false })),
    openPatreonLoginWindow: vi.fn(async () => ({ ok: false })),
    getSavedPatreonSessionStatus: vi.fn(async () => ({ available: false, canEncrypt: true })),
    saveLastPatreonSession: vi.fn(async () => ({ available: true, canEncrypt: true })),
    forgetPatreonSession: vi.fn(async () => ({ available: false, canEncrypt: true })),
    startReactionDownload: vi.fn(async () => ({ jobId: 'job-1' })),
    cancelDownload: vi.fn(async () => undefined),
    onDownloadProgress: vi.fn(() => vi.fn()),
    openOnboardingWizard: vi.fn(async () => undefined),
    openImportWizard: vi.fn(async () => undefined),
    getImportWizardContext: vi.fn(async () => ({ mode: 'new' as const, sessionId: null, movie: null })),
    finishOnboardingWizard: vi.fn(async () => undefined),
    onWizardLifecycle: vi.fn((callback: WizardLifecycleCallback) => {
      wizardLifecycleCallback = callback
      return vi.fn()
    })
  }

  return Object.assign(api, {
    emitWizardLifecycle(event: Parameters<WizardLifecycleCallback>[0]) {
      wizardLifecycleCallback?.(event)
    }
  }) as WatchAlongApi & { emitWizardLifecycle(event: Parameters<WizardLifecycleCallback>[0]): void }
}

describe('App', () => {
  let playMock: ReturnType<typeof vi.fn>
  let pauseMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    playMock = vi.fn(async () => undefined)
    pauseMock = vi.fn()
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: playMock
    })
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      configurable: true,
      value: pauseMock
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

  it('renders the populated library by default and opens a session from a card', async () => {
    const api = createApi()
    window.watchAlong = api

    render(<App />)

    expect(await screen.findByLabelText('WatchAlong Library')).toBeInTheDocument()
    expect(api.getMediaUrl).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /First/ }))

    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    expect(api.getMediaUrl).toHaveBeenCalledWith('movie', 's1')
  })

  it('resumes the active session on launch when the launch preference is off', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    render(<App />)

    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    expect(screen.queryByLabelText('WatchAlong Library')).not.toBeInTheDocument()
  })

  it('falls back to the empty library when resume on launch is enabled but no sessions exist', async () => {
    const api = createApi(createLibrary(null, []), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    render(<App />)

    expect(await screen.findByText('Your watchalong collection is empty')).toBeInTheDocument()
    expect(api.getMediaUrl).not.toHaveBeenCalled()
  })

  it('renders a startup recovery screen when initial library loading fails and retries', async () => {
    const api = createApi()
    api.getLibrary = vi.fn()
      .mockRejectedValueOnce(new Error('Library file could not be read'))
      .mockResolvedValueOnce(createLibrary(null, []))
    window.watchAlong = api

    render(<App />)

    expect(await screen.findByLabelText('Startup error')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong while loading your library.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Retry/i }))

    expect(await screen.findByLabelText('WatchAlong Library')).toBeInTheDocument()
    expect(api.getLibrary).toHaveBeenCalledTimes(2)
  })

  it('handles mute and offset keyboard shortcuts', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))

    fireEvent.keyDown(window, { code: 'KeyR' })
    await waitFor(() => expect(api.saveActiveSession).toHaveBeenCalledWith({ isReactionMuted: true }))

    fireEvent.keyDown(window, { code: 'BracketRight' })
    await waitFor(() => expect(api.saveActiveSession).toHaveBeenCalledWith({ offsetSeconds: 0.1 }))
  })

  it('shows missing-media recovery and locates a missing movie file', async () => {
    const api = createApi(createLibrary('s1', [firstSession]), { ...defaultPreferences, openLibraryOnLaunch: false })
    api.getMediaUrl = vi.fn(async (role, sessionId) => role === 'movie' ? null : `watchalong://media/${sessionId}/${role}`)
    window.watchAlong = api

    render(<App />)

    expect(await screen.findByLabelText('Missing media recovery')).toBeInTheDocument()
    expect(screen.getByText('Movie file')).toBeInTheDocument()
    expect(screen.getAllByText('s1-movie.mp4').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: /Locate movie/i }))

    await waitFor(() =>
      expect(api.replaceSessionMedia).toHaveBeenCalledWith('s1', 'movie', 'C:\\Movies\\Located movie.mp4', undefined)
    )
  })

  it('removes a missing-media session and returns to the library', async () => {
    const api = createApi(createLibrary('s1', [firstSession]), { ...defaultPreferences, openLibraryOnLaunch: false })
    api.getMediaUrl = vi.fn(async (role, sessionId) => role === 'movie' ? null : `watchalong://media/${sessionId}/${role}`)
    window.watchAlong = api

    render(<App />)

    expect(await screen.findByLabelText('Missing media recovery')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Remove session/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }))

    await waitFor(() => expect(api.deleteSession).toHaveBeenCalledWith('s1'))
    expect(await screen.findByText('Your watchalong collection is empty')).toBeInTheDocument()
  })

  it('attaches sync playback after media elements render', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
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
    const api = createApi(createLibrary('s1', [session]), { ...defaultPreferences, openLibraryOnLaunch: false })
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

  it('shows the first-run welcome and opens the import wizard from Get Started', async () => {
    const api = createApi(createLibrary(null, []))
    api.getPreferences = vi.fn(async () => ({ ...defaultPreferences, hasCompletedOnboarding: false }))
    window.watchAlong = api

    render(<App />)

    expect(await screen.findByText('Your watchalong collection is empty')).toBeInTheDocument()
    expect(screen.getByLabelText('Welcome to WatchAlong')).toBeInTheDocument()
    expect(api.openOnboardingWizard).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Get Started/i }))
    expect(api.openImportWizard).toHaveBeenCalledWith({ mode: 'new' })
  })

  it('dims, pauses, and resumes playback around a cancelled wizard', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    fireEvent.loadedMetadata(container.querySelector('video.reaction-video')!)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)
    fireEvent.click(screen.getByLabelText('Play'))
    await waitFor(() => expect(playMock).toHaveBeenCalledTimes(2))

    act(() => api.emitWizardLifecycle({ type: 'opened' }))
    expect(container.querySelector('.main-window-dim')).toBeInTheDocument()
    expect(pauseMock).toHaveBeenCalled()

    const playCallsBeforeResume = playMock.mock.calls.length
    act(() => api.emitWizardLifecycle({ type: 'closed', outcome: 'cancelled' }))
    await waitFor(() => expect(container.querySelector('.main-window-dim')).not.toBeInTheDocument())
    await waitFor(() => expect(playMock.mock.calls.length).toBeGreaterThan(playCallsBeforeResume))
  })

  it('refreshes media and enters sync setup after wizard completion without resuming playback', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    fireEvent.loadedMetadata(container.querySelector('video.reaction-video')!)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)
    fireEvent.click(screen.getByLabelText('Play'))
    await waitFor(() => expect(playMock).toHaveBeenCalledTimes(2))

    act(() => api.emitWizardLifecycle({ type: 'opened' }))
    const playCallsBeforeCompletion = playMock.mock.calls.length
    act(() => api.emitWizardLifecycle({ type: 'closed', outcome: 'completed' }))

    await waitFor(() => expect(api.getLibrary).toHaveBeenCalledTimes(2))
    expect(playMock.mock.calls.length).toBe(playCallsBeforeCompletion)

    fireEvent.loadedMetadata(container.querySelector('video.reaction-video')!)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)
    expect(await screen.findByText('Sync setup')).toBeInTheDocument()
  })

  it('opens and closes the command panel with Ctrl+Shift+P, manages focus, and persists preferences', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))

    screen.getByLabelText('Command Panel').focus()
    fireEvent.keyDown(window, { code: 'KeyP', ctrlKey: true, shiftKey: true })
    expect(await screen.findByLabelText('WatchAlong Command Panel')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Close Command Panel')).toHaveFocus())
    fireEvent.click(screen.getByRole('button', { name: /Preferences/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Open Library on launch/i }))

    await waitFor(() => expect(api.setPreference).toHaveBeenCalledWith('openLibraryOnLaunch', true))

    fireEvent.click(screen.getByRole('button', { name: /Help & About/i }))
    expect(screen.getByRole('button', { name: /Buy the developer a coffee/i })).toBeDisabled()
    expect(screen.getByText('Donation link coming soon.')).toBeInTheDocument()

    fireEvent.keyDown(window, { code: 'Escape' })
    await waitFor(() => expect(screen.queryByLabelText('WatchAlong Command Panel')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByLabelText('Command Panel')).toHaveFocus())
  })

  it('renames and deletes sessions from library card actions', async () => {
    const api = createApi()
    window.watchAlong = api

    render(<App />)

    expect(await screen.findByLabelText('WatchAlong Library')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'More actions' })[0])
    fireEvent.click(screen.getByRole('button', { name: /Rename/i }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renamed session' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }))

    await waitFor(() => expect(api.renameSession).toHaveBeenCalledWith('s1', 'Renamed session'))

    fireEvent.click(screen.getAllByRole('button', { name: 'More actions' })[0])
    fireEvent.click(screen.getByRole('button', { name: /Delete/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }))

    await waitFor(() => expect(api.deleteSession).toHaveBeenCalledWith('s1'))
  })

  it('renders unknown for invalid session timestamps', async () => {
    const session = createSession('s1', 'First', 0, { updatedAt: 'not-a-date' })
    const api = createApi(createLibrary('s1', [session]))
    window.watchAlong = api

    render(<App />)

    expect(await screen.findByText(/Local file \/ Unknown/i)).toBeInTheDocument()
  })
})

function createSession(
  id: string,
  title: string,
  lastReactionTimeSeconds: number,
  patch: Partial<LibrarySession> = {}
): LibrarySession {
  const base: LibrarySession = {
    id,
    title,
    reactionPath: `C:\\Videos\\${id}-reaction.mp4`,
    reactionSource: 'local',
    reactionDurationSeconds: 120,
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
    updatedAt: '2026-01-01T00:00:00.000Z'
  }

  return {
    ...base,
    ...patch,
    reactionSource: patch.reactionSource ?? base.reactionSource,
    reactionDurationSeconds: patch.reactionDurationSeconds ?? base.reactionDurationSeconds
  }
}
